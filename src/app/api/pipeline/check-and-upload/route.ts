/**
 * POST /api/pipeline/check-and-upload
 * 
 * 렌더링 상태 확인 및 YouTube 업로드 API
 * 
 * 1. Runway 또는 Google 작업 상태 조회
 * 2. 완료 시 영상 다운로드 및 저장
 * 3. autoUpload가 true면 YouTube 업로드
 */

import { NextRequest, NextResponse } from 'next/server';
import { getBrewVideoResult as getRunwayVideoResult } from '@/lib/runway';
import { getGoogleVideoResult } from '@/lib/google-video';
import { getKlingVideoResult } from '@/lib/kling';
import { getVeoVideoResult } from '@/lib/veo';
import { getHiggsfieldVideoResult } from '@/lib/higgsfield';
import { checkAndDownloadClips, mergeClipsIntoVideo, updateStep } from '@/lib/multi-clip';
import { saveVideo, downloadFile, saveTempFile } from '@/lib/storage';
import { mergeVideoAndAudio } from '@/lib/ffmpeg';
import { uploadToYoutube } from '@/lib/youtube';
import { getJob, updateJobStatus } from '@/lib/jobs';
import type { CheckAndUploadRequest, CheckAndUploadResponse, ApiErrorResponse, BrewVideoResult, ClipInfo, MultiClipStep } from '@/types';
import path from 'path';
import fs from 'fs/promises';

export async function POST(request: NextRequest) {
  try {
    // 요청 파싱
    const body = await request.json() as CheckAndUploadRequest;
    const { jobId } = body;

    // 기본 검증
    if (!jobId || typeof jobId !== 'string') {
      return NextResponse.json<ApiErrorResponse>(
        { success: false, error: 'jobId는 필수입니다.' },
        { status: 400 }
      );
    }

    // Job 조회
    const job = await getJob(jobId);
    if (!job) {
      return NextResponse.json<ApiErrorResponse>(
        { success: false, error: '해당 Job을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 이미 완료되거나 실패한 경우
    if (job.status === 'completed') {
      return NextResponse.json<CheckAndUploadResponse>({
        success: true,
        job,
        message: '이미 완료된 작업입니다.',
      });
    }

    if (job.status === 'failed') {
      return NextResponse.json<CheckAndUploadResponse>({
        success: false,
        job,
        message: `작업이 실패했습니다: ${job.errorMessage}`,
      });
    }

    // 렌더링 상태가 아닌 경우
    if (job.status !== 'render') {
      return NextResponse.json<CheckAndUploadResponse>({
        success: true,
        job,
        message: `현재 상태: ${job.status}. 렌더링 단계가 아닙니다.`,
      });
    }

    // Brew Job ID 확인
    if (!job.brewJobId) {
      return NextResponse.json<ApiErrorResponse>(
        { success: false, error: '렌더링 작업 ID가 없습니다.' },
        { status: 400 }
      );
    }

    try {
      // Provider 판별
      // - MultiClip: "multiclip|"로 시작
      // - Higgsfield: "higgsfield|"로 시작
      // - Veo: "veo|" 또는 "veo-"로 시작
      // - Google: "google-"로 시작
      // - Runway: "gen_"으로 시작
      // - Kling: 나머지 (UUID 형식)
      const isMultiClipProvider = job.brewJobId.startsWith('multiclip|');
      const isHiggsfieldProvider = job.brewJobId.startsWith('higgsfield|');
      const isVeoProvider = job.brewJobId.startsWith('veo|') || job.brewJobId.startsWith('veo-');
      const isGoogleProvider = job.brewJobId.startsWith('google-');
      const isRunwayProvider = job.brewJobId.startsWith('gen_');
      const isKlingProvider = !isMultiClipProvider && !isHiggsfieldProvider && !isVeoProvider && !isGoogleProvider && !isRunwayProvider;

      // 멀티클립 처리
      if (isMultiClipProvider) {
        return await handleMultiClipCheck(job);
      }
      
      let providerName: string;
      if (isHiggsfieldProvider) providerName = 'Higgsfield';
      else if (isVeoProvider) providerName = 'Veo';
      else if (isGoogleProvider) providerName = 'Google';
      else if (isKlingProvider) providerName = 'Kling';
      else providerName = 'Runway';
      
      // 상태 조회
      console.log(`[CheckAndUpload] ${providerName} 상태 조회: ${job.brewJobId}`);
      
      let videoResult: BrewVideoResult;
      if (isHiggsfieldProvider) {
        videoResult = await getHiggsfieldVideoResult(job.brewJobId);
      } else if (isVeoProvider) {
        videoResult = await getVeoVideoResult(job.brewJobId);
      } else if (isGoogleProvider) {
        videoResult = await getGoogleVideoResult(job.brewJobId);
      } else if (isKlingProvider) {
        videoResult = await getKlingVideoResult(job.brewJobId);
      } else {
        videoResult = await getRunwayVideoResult(job.brewJobId);
      }

      // 상태별 처리
      switch (videoResult.status) {
        case 'pending':
        case 'processing':
          return NextResponse.json<CheckAndUploadResponse>({
            success: true,
            job,
            message: `영상 렌더링 중입니다. (${providerName}) 상태: ${videoResult.status}`,
          });

        case 'failed':
          const failedJob = await updateJobStatus(job.id, {
            status: 'failed',
            errorMessage: videoResult.errorMessage || '영상 렌더링에 실패했습니다.',
          });

          return NextResponse.json<CheckAndUploadResponse>({
            success: false,
            job: failedJob!,
            message: videoResult.errorMessage || '영상 렌더링에 실패했습니다.',
          });

        case 'completed':
          if (!videoResult.videoUrl) {
            const errorJob = await updateJobStatus(job.id, {
              status: 'failed',
              errorMessage: '렌더링 완료되었으나 영상 URL을 받지 못했습니다.',
            });

            return NextResponse.json<CheckAndUploadResponse>({
              success: false,
              job: errorJob!,
              message: '렌더링 완료되었으나 영상 URL을 받지 못했습니다.',
            });
          }

          let videoUrl: string;
          let videoPath: string;

          // Google은 이미 로컬에 저장됨, Runway는 다운로드 필요
          if (isGoogleProvider) {
            videoUrl = videoResult.videoUrl;
            // URL에서 경로 추출 (상대/절대 URL 모두 처리)
            const urlPath = videoResult.videoUrl.startsWith('/') 
              ? videoResult.videoUrl 
              : new URL(videoResult.videoUrl).pathname;
            videoPath = `${process.cwd()}/public${urlPath}`;
          } else if (isHiggsfieldProvider && job.audioUrl) {
            // Higgsfield: 영상 다운로드 후 오디오와 합성
            console.log(`[CheckAndUpload] Higgsfield 영상 + 오디오 합성 시작...`);
            
            // 1. 영상 다운로드
            const videoBuffer = await downloadFile(videoResult.videoUrl);
            const tempVideoPath = await saveTempFile(videoBuffer, `temp-video-${job.id}.mp4`);
            
            // 2. 오디오 파일 경로 확인 (상대/절대 URL 모두 처리)
            const audioUrlPath = job.audioUrl.startsWith('/') 
              ? job.audioUrl 
              : new URL(job.audioUrl).pathname;
            const audioPath = path.join(process.cwd(), 'public', audioUrlPath);
            
            // 3. FFmpeg로 영상 + 오디오 합성
            const finalVideoFileName = `shorts-${job.id}-${Date.now()}.mp4`;
            const finalVideoPath = path.join(process.cwd(), 'public', 'videos', finalVideoFileName);
            
            // videos 폴더 생성 확인
            await fs.mkdir(path.dirname(finalVideoPath), { recursive: true });
            
            await mergeVideoAndAudio(tempVideoPath, audioPath, finalVideoPath);
            
            // 4. 임시 파일 삭제
            try {
              await fs.unlink(tempVideoPath);
            } catch {
              // 무시
            }
            
            const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3002';
            videoUrl = `${baseUrl}/videos/${finalVideoFileName}`;
            videoPath = finalVideoPath;
            
            console.log(`[CheckAndUpload] 영상 + 오디오 합성 완료: ${videoUrl}`);
          } else {
            console.log(`[CheckAndUpload] 렌더링 완료, 영상 다운로드 시작...`);
            
            // 영상 다운로드 및 저장
            const videoBuffer = await downloadFile(videoResult.videoUrl);
            const videoFileName = `shorts-${job.id}-${Date.now()}.mp4`;
            const savedResult = await saveVideo({
              buffer: videoBuffer,
              fileName: videoFileName,
            });
            videoUrl = savedResult.url;
            videoPath = savedResult.path;
          }

          console.log(`[CheckAndUpload] 영상 저장 완료: ${videoUrl}`);

          // autoUpload가 true면 YouTube 업로드
          if (job.autoUpload) {
            console.log(`[CheckAndUpload] YouTube 업로드 시작...`);
            
            await updateJobStatus(job.id, {
              status: 'upload',
              videoUrl,
            });

            try {
              const { youtubeUrl, youtubeVideoId } = await uploadToYoutube({
                videoPathOrUrl: videoPath,
                title: generateTitle(job.topic),
                description: generateDescription(job.topic, job.script || ''),
                tags: generateTags(job.topic, job.category),
                privacyStatus: 'unlisted', // 기본값: 미등록 (검토 후 공개 가능)
              });

              const completedJob = await updateJobStatus(job.id, {
                status: 'completed',
                youtubeUrl,
                youtubeVideoId,
              });

              console.log(`[CheckAndUpload] YouTube 업로드 완료: ${youtubeUrl}`);

              return NextResponse.json<CheckAndUploadResponse>({
                success: true,
                job: completedJob!,
                message: '영상이 YouTube에 업로드되었습니다.',
              });

            } catch (uploadError) {
              const errorMessage = uploadError instanceof Error 
                ? uploadError.message 
                : 'YouTube 업로드 중 오류가 발생했습니다.';

              const errorJob = await updateJobStatus(job.id, {
                status: 'failed',
                videoUrl,
                errorMessage,
              });

              console.error(`[CheckAndUpload] YouTube 업로드 오류:`, uploadError);

              return NextResponse.json<CheckAndUploadResponse>({
                success: false,
                job: errorJob!,
                message: errorMessage,
              });
            }
          } else {
            // autoUpload가 false인 경우
            const completedJob = await updateJobStatus(job.id, {
              status: 'completed',
              videoUrl,
            });

            return NextResponse.json<CheckAndUploadResponse>({
              success: true,
              job: completedJob!,
              message: '영상 렌더링이 완료되었습니다. (자동 업로드 비활성화)',
            });
          }

        default:
          return NextResponse.json<CheckAndUploadResponse>({
            success: true,
            job,
            message: `알 수 없는 상태: ${videoResult.status}`,
          });
      }

    } catch (error) {
      const errorMessage = error instanceof Error 
        ? error.message 
        : '상태 확인 중 오류가 발생했습니다.';

      const errorJob = await updateJobStatus(job.id, {
        status: 'failed',
        errorMessage,
      });

      console.error(`[CheckAndUpload] 오류 발생:`, error);

      return NextResponse.json<CheckAndUploadResponse>({
        success: false,
        job: errorJob!,
        message: errorMessage,
      }, { status: 500 });
    }

  } catch (error) {
    console.error('[CheckAndUpload] 요청 처리 오류:', error);

    const errorMessage = error instanceof Error 
      ? error.message 
      : '요청 처리 중 오류가 발생했습니다.';

    return NextResponse.json<ApiErrorResponse>(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * YouTube 영상 제목 생성
 */
function generateTitle(topic: string): string {
  // 50자 이내로 제한
  const baseTitle = topic.length > 45 ? topic.substring(0, 45) + '...' : topic;
  return `${baseTitle} #쇼츠`;
}

/**
 * YouTube 영상 설명 생성
 */
function generateDescription(topic: string, script: string): string {
  const preview = script.length > 200 ? script.substring(0, 200) + '...' : script;
  
  return `📌 ${topic}

${preview}

---
#쇼츠 #shorts #5060 #시니어 #건강 #정보
구독과 좋아요 부탁드립니다! 🙏`;
}

/**
 * YouTube 태그 생성
 */
function generateTags(topic: string, category: string | null): string[] {
  const baseTags = ['쇼츠', 'shorts', '5060', '시니어', '정보'];
  
  // 주제에서 키워드 추출 (간단한 방식)
  const topicWords = topic.split(/\s+/).filter(word => word.length >= 2).slice(0, 3);
  
  // 카테고리별 태그
  const categoryTags: Record<string, string[]> = {
    health: ['건강', '의료', '건강정보'],
    finance: ['재테크', '금융', '투자'],
    healing: ['힐링', '마음건강', '명상'],
    lifestyle: ['라이프스타일', '생활팁'],
    hobby: ['취미', '여가'],
    travel: ['여행', '관광'],
    food: ['요리', '음식', '레시피'],
    culture: ['문화', '역사'],
    tech: ['디지털', 'IT', '스마트폰'],
  };

  const catTags = category ? categoryTags[category] || [] : [];

  return [...baseTags, ...topicWords, ...catTags];
}

/**
 * 멀티클립 상태 확인 및 합성
 */
async function handleMultiClipCheck(job: any): Promise<NextResponse> {
  console.log(`[MultiClip] 멀티클립 상태 확인 시작: ${job.brewJobId}`);
  
  // 새 워크플로우: Job에 clips 필드가 있는 경우
  let clips: ClipInfo[] = job.clips || [];
  let steps: MultiClipStep[] = job.steps || [];
  const audioDuration = job.audioDuration || 60;
  
  // brewJobId 형식: "multiclip|provider|model|duration|jobId1,jobId2,..."
  const parts = job.brewJobId.split('|');
  
  if (parts.length < 5) {
    return NextResponse.json<CheckAndUploadResponse>({
      success: false,
      job,
      message: '잘못된 멀티클립 작업 형식입니다.',
    });
  }

  const provider = parts[1];
  const model = parts[2];
  const durationStr = parts[3];
  const jobIdsStr = parts[4];
  
  const targetDuration = parseInt(durationStr, 10);
  const jobIds = jobIdsStr.split(',').filter(Boolean);
  
  console.log(`[MultiClip] 파싱 결과 - 제공자: ${provider}, 모델: ${model}, 길이: ${targetDuration}, 클립 수: ${jobIds.length}`);

  // clips가 비어있으면 기존 방식대로 생성
  if (clips.length === 0) {
    const defaultDuration = provider === 'veo' ? 8 : 10;
    clips = jobIds.map((jobId: string, index: number) => ({
      index,
      scriptSection: '',
      prompt: '',
      duration: defaultDuration,
      status: 'processing' as const,
      jobId,
    }));
  }

  // 각 클립 상태 확인 및 다운로드
  const { clips: updatedClips, allCompleted } = await checkAndDownloadClips(clips, job.id);
  clips = updatedClips;
  
  const pendingCount = clips.filter(c => c.status === 'processing' || c.status === 'pending').length;
  const completedCount = clips.filter(c => c.status === 'completed').length;
  const failedCount = clips.filter(c => c.status === 'failed').length;
  const totalCount = clips.length;

  console.log(`[MultiClip] 진행 상황: ${completedCount}/${totalCount} 완료, ${pendingCount} 진행중, ${failedCount} 실패`);

  // 클립 정보 업데이트
  await updateJobStatus(job.id, {
    clips,
    clipProgress: `${completedCount}/${totalCount}`,
  });

  // 아직 진행 중인 클립이 있으면 대기
  if (pendingCount > 0) {
    return NextResponse.json<CheckAndUploadResponse>({
      success: true,
      job: { ...job, clips, clipProgress: `${completedCount}/${totalCount}` },
      message: `멀티클립 렌더링 중: ${completedCount}/${totalCount} 완료 (${Math.round(completedCount/totalCount*100)}%)`,
    });
  }

  // 모두 실패한 경우
  if (completedCount === 0) {
    steps = updateStep(steps, 'render', { status: 'failed', endTime: new Date().toISOString() });
    const errorJob = await updateJobStatus(job.id, {
      status: 'failed',
      errorMessage: '모든 클립 생성에 실패했습니다.',
      steps,
    });
    return NextResponse.json<CheckAndUploadResponse>({
      success: false,
      job: errorJob!,
      message: '모든 클립 생성에 실패했습니다.',
    });
  }

  // 렌더링 완료, 자동으로 합치기 단계로 이동
  steps = updateStep(steps, 'render', { status: 'completed', endTime: new Date().toISOString() });
  steps = updateStep(steps, 'merge', { status: 'processing', startTime: new Date().toISOString() });
  
  await updateJobStatus(job.id, {
    status: 'merge',
    steps,
    clips,
  });

  // 클립들을 자동으로 합치기
  console.log(`[MultiClip] ${completedCount}개 클립 자동 합치기 시작...`);

  try {
    const finalVideoFileName = `multiclip-${job.id}-${Date.now()}.mp4`;
    const finalVideoPath = path.join(process.cwd(), 'public', 'videos', finalVideoFileName);
    
    // videos 폴더 생성 확인
    await fs.mkdir(path.dirname(finalVideoPath), { recursive: true });

    // 오디오 파일 경로 (반드시 필요)
    let audioPath: string | undefined;
    if (job.audioUrl) {
      const audioUrlPath = job.audioUrl.startsWith('/') 
        ? job.audioUrl 
        : new URL(job.audioUrl).pathname;
      audioPath = path.join(process.cwd(), 'public', audioUrlPath);
    }

    if (!audioPath) {
      throw new Error('오디오 파일이 없어 영상을 합칠 수 없습니다.');
    }

    // 클립 합치기 (오디오 길이에 맞춰 자동 연장)
    console.log(`[MultiClip] 오디오 동기화 합성 시작 (오디오: ${audioPath})`);
    await mergeClipsIntoVideo(clips, finalVideoPath, audioPath, audioDuration);
    
    steps = updateStep(steps, 'merge', { status: 'completed', endTime: new Date().toISOString() });

    const videoUrl = `/videos/${finalVideoFileName}`;
    
    // 개별 클립 URL 수집
    const clipUrls = clips
      .filter(c => c.status === 'completed' && c.videoUrl)
      .sort((a, b) => a.index - b.index)
      .map(c => c.videoUrl!);

    console.log(`[MultiClip] 합성 완료: ${videoUrl}`);

    // autoUpload 처리
    if (job.autoUpload) {
      console.log(`[MultiClip] YouTube 업로드 시작...`);
      
      await updateJobStatus(job.id, {
        status: 'upload',
        videoUrl,
      });

      try {
        const { youtubeUrl, youtubeVideoId } = await uploadToYoutube({
          videoPathOrUrl: finalVideoPath,
          title: generateTitle(job.topic),
          description: generateDescription(job.topic, job.script || ''),
          tags: generateTags(job.topic, job.category),
          privacyStatus: 'unlisted',
        });

        const completedJob = await updateJobStatus(job.id, {
          status: 'completed',
          youtubeUrl,
          youtubeVideoId,
        });

        return NextResponse.json<CheckAndUploadResponse>({
          success: true,
          job: completedJob!,
          message: `멀티클립 영상 (${completedCount}개 클립)이 YouTube에 업로드되었습니다.`,
        });

      } catch (uploadError) {
        const errorMessage = uploadError instanceof Error 
          ? uploadError.message 
          : 'YouTube 업로드 중 오류가 발생했습니다.';

        const errorJob = await updateJobStatus(job.id, {
          status: 'failed',
          videoUrl,
          errorMessage,
        });

        return NextResponse.json<CheckAndUploadResponse>({
          success: false,
          job: errorJob!,
          message: errorMessage,
        });
      }
    } else {
      const completedJob = await updateJobStatus(job.id, {
        status: 'completed',
        videoUrl,
        clipUrls,
        clips,
        steps,
      });

      return NextResponse.json<CheckAndUploadResponse>({
        success: true,
        job: completedJob!,
        message: `멀티클립 영상 렌더링 완료 (${completedCount}개 클립)`,
      });
    }

  } catch (mergeError) {
    const errorMessage = mergeError instanceof Error 
      ? mergeError.message 
      : '클립 합성 중 오류가 발생했습니다.';

    const errorJob = await updateJobStatus(job.id, {
      status: 'failed',
      errorMessage,
    });

    return NextResponse.json<CheckAndUploadResponse>({
      success: false,
      job: errorJob!,
      message: errorMessage,
    });
  }
}
