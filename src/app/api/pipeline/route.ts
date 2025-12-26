/**
 * POST /api/pipeline
 * 
 * 유튜브 쇼츠 영상 생성 파이프라인 시작 API
 * 
 * 1. 스크립트 생성 (OpenRouter 또는 Google AI)
 * 2. 음성 생성 (ElevenLabs TTS)
 * 3. 영상 렌더링 요청 (Runway ML 또는 Google Imagen + FFmpeg)
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateScript as generateScriptGoogle } from '@/lib/llm';
import { generateScript as generateScriptOpenRouter } from '@/lib/openrouter';
import { generateTTS } from '@/lib/elevenlabs';
import { saveAudio } from '@/lib/storage';
import { requestBrewVideo as requestRunwayVideo } from '@/lib/runway';
import { requestGoogleVideo } from '@/lib/google-video';
import { requestKlingVideo } from '@/lib/kling';
import { requestVeoVideo } from '@/lib/veo';
import { requestHiggsfieldVideo } from '@/lib/higgsfield';
import { 
  initializeSteps, 
  updateStep, 
  splitScriptWithDurations, 
  initializeClipsFromSections,
  generateClipPrompts,
  requestClipVideos 
} from '@/lib/multi-clip';
import { getAudioDuration } from '@/lib/ffmpeg';
import { createJob, updateJobStatus } from '@/lib/jobs';
import type { PipelineRequest, PipelineResponse, ApiErrorResponse, VideoProvider, AIProvider, VeoModel, HiggsfieldModel, MultiClipStep, ClipInfo } from '@/types';

export async function POST(request: NextRequest) {
  try {
    // 요청 파싱
    const body = await request.json() as PipelineRequest;
    const { 
      topic, 
      category, 
      voiceId, 
      autoUpload = true, 
      videoProvider = 'veo',  // 기본값: Veo3
      aiProvider = 'openrouter'  // 기본값: OpenRouter (다양한 AI 활용)
    } = body;
    
    // Veo 모델 선택 (요청에서 가져오거나 기본값)
    const veoModel = (body as any).veoModel as VeoModel | undefined;
    // Veo 영상 길이 (초)
    const veoDuration = (body as any).veoDuration as number | undefined;
    // Higgsfield 모델 선택 (요청에서 가져오거나 기본값)
    const higgsfieldModel = (body as any).higgsfieldModel as HiggsfieldModel | undefined;
    // 멀티클립 모드
    const useMultiClip = (body as any).useMultiClip as boolean | undefined;
    const targetDuration = (body as any).targetDuration as number | undefined;
    // Kling 영상 길이
    const klingDuration = (body as any).klingDuration as '5' | '10' | undefined;

    // 기본 검증
    if (!topic || typeof topic !== 'string') {
      return NextResponse.json<ApiErrorResponse>(
        { success: false, error: '주제(topic)는 필수입니다.' },
        { status: 400 }
      );
    }

    if (topic.length < 2 || topic.length > 200) {
      return NextResponse.json<ApiErrorResponse>(
        { success: false, error: '주제는 2자 이상 200자 이하여야 합니다.' },
        { status: 400 }
      );
    }

    // Veo 음성 포함 옵션 (Veo가 음성도 생성)
    const veoWithAudio = (body as any).veoWithAudio as boolean | undefined;

    // Step 1: Job 생성
    const job = await createJob({
      topic,
      category,
      autoUpload,
    });

    console.log(`[Pipeline] Job 생성 완료: ${job.id}, AI: ${aiProvider}, Video: ${videoProvider}, VeoWithAudio: ${veoWithAudio}`);

    try {
      // Step 2: 스크립트 생성 (AI Provider에 따라 분기)
      console.log(`[Pipeline] 스크립트 생성 시작 (${aiProvider})...`);
      
      let script: string;
      if (aiProvider === 'openrouter') {
        // OpenRouter: Claude, GPT, Gemini 등 상황별 최적 모델 사용
        script = await generateScriptOpenRouter({ topic, category });
      } else {
        // Google AI (기존 방식)
        script = await generateScriptGoogle({ topic, category });
      }
      
      await updateJobStatus(job.id, {
        status: 'audio',
        script,
      });
      console.log(`[Pipeline] 스크립트 생성 완료 (${script.length}자)`);

      let audioUrl: string | undefined;
      let audioPath: string | undefined;

      // Veo + 음성 포함 모드: TTS 건너뛰고 Veo가 음성 생성
      if (videoProvider === 'veo' && veoWithAudio) {
        console.log(`[Pipeline] Veo 음성 포함 모드 - TTS 건너뛰기`);
        await updateJobStatus(job.id, {
          status: 'render',
        });
      } else {
        // 기존 방식: TTS 음성 생성
        // Step 3: TTS 음성 생성
        console.log(`[Pipeline] TTS 생성 시작...`);
        const { audioBuffer, fileName } = await generateTTS({
          script,
          voiceId,
        });

        // Step 4: 오디오 파일 저장
        const savedAudio = await saveAudio({
          buffer: audioBuffer,
          fileName,
        });
        audioUrl = savedAudio.url;
        audioPath = savedAudio.path;

        await updateJobStatus(job.id, {
          status: 'render',
          audioUrl,
        });
        console.log(`[Pipeline] TTS 저장 완료: ${audioUrl}`);
      }

      // Step 5: 영상 생성 요청 (Provider에 따라 분기)
      let brewJobId: string;
      let providerName: string;

      if (videoProvider === 'higgsfield') {
        // Higgsfield 방식 (여러 AI 모델 통합)
        const selectedModel = higgsfieldModel || 'veo-3.1';
        
        if (useMultiClip && targetDuration && targetDuration > 15 && audioPath) {
          // ============================================
          // 🎬 멀티클립 모드: 새 워크플로우
          // ============================================
          console.log(`[Pipeline] 멀티클립 모드 시작 (목표: ${targetDuration}초, 모델: ${selectedModel})...`);
          providerName = `Higgsfield MultiClip (${selectedModel})`;
          
          // Step 1: 작업 단계 초기화
          let steps = initializeSteps();
          steps = updateStep(steps, 'script', { status: 'completed', endTime: new Date().toISOString() });
          steps = updateStep(steps, 'tts', { status: 'completed', endTime: new Date().toISOString() });
          
          // Step 2: 오디오 길이 측정
          steps = updateStep(steps, 'split', { status: 'processing', startTime: new Date().toISOString() });
          console.log(`[Pipeline] 오디오 길이 측정 중...`);
          const audioDuration = await getAudioDuration(audioPath);
          console.log(`[Pipeline] 오디오 길이: ${audioDuration}초`);
          
          // Step 3: 스크립트 분할 및 유연한 기간 계산
          const sections = splitScriptWithDurations(script, audioDuration, 10, 4, 10);
          console.log(`[Pipeline] 스크립트 ${sections.length}개 섹션으로 분할 완료`);
          steps = updateStep(steps, 'split', { 
            status: 'completed', 
            endTime: new Date().toISOString(),
            result: { sectionCount: sections.length, audioDuration }
          });
          
          // Step 4: 클립 정보 초기화 (계산된 유연한 기간 사용)
          let clips = initializeClipsFromSections(sections);
          
          // Step 5: AI로 영상 프롬프트 생성
          steps = updateStep(steps, 'prompts', { status: 'processing', startTime: new Date().toISOString() });
          await updateJobStatus(job.id, {
            status: 'prompts',
            steps,
            clips,
            audioDuration,
          });
          
          console.log(`[Pipeline] AI 영상 프롬프트 생성 시작...`);
          clips = await generateClipPrompts(clips, topic, category);
          steps = updateStep(steps, 'prompts', { status: 'completed', endTime: new Date().toISOString() });
          
          // Step 6: 영상 생성 요청
          steps = updateStep(steps, 'render', { status: 'processing', startTime: new Date().toISOString() });
          await updateJobStatus(job.id, {
            status: 'render',
            steps,
            clips,
          });
          
          console.log(`[Pipeline] ${clips.length}개 클립 영상 생성 요청 시작...`);
          clips = await requestClipVideos(clips, 'higgsfield', selectedModel);
          
          // 클립 Job ID들을 brewJobId에 저장
          const jobIds = clips.map(c => c.jobId).filter(Boolean).join(',');
          brewJobId = `multiclip|higgsfield|${selectedModel}|${audioDuration}|${jobIds}`;
          
          await updateJobStatus(job.id, {
            brewJobId,
            steps,
            clips,
          });
          
          console.log(`[Pipeline] 멀티클립 ${clips.length}개 작업 시작됨`);
          
        } else {
          // 일반 모드: 단일 클립 생성
          console.log(`[Pipeline] Higgsfield 영상 생성 요청 시작 (모델: ${selectedModel})...`);
          providerName = `Higgsfield (${selectedModel})`;
          const result = await requestHiggsfieldVideo({
            prompt: script,
            model: selectedModel,
            aspectRatio: '9:16',
            duration: 8,
          });
          brewJobId = result.jobId;
        }
      } else if (videoProvider === 'veo') {
        // Google Veo 3 방식 (최신 AI 영상 생성)
        const selectedModel = veoModel || 'veo-3';
        const selectedDuration = veoDuration || 8; // 기본 8초
        
        if (useMultiClip && targetDuration && targetDuration > 15 && audioPath) {
          // ============================================
          // 🎬 멀티클립 모드: Veo 3 워크플로우
          // ============================================
          console.log(`[Pipeline] Veo 멀티클립 모드 시작 (목표: ${targetDuration}초, 모델: ${selectedModel})...`);
          providerName = `Veo MultiClip (${selectedModel})`;
          
          // Step 1: 작업 단계 초기화
          let steps = initializeSteps();
          steps = updateStep(steps, 'script', { status: 'completed', endTime: new Date().toISOString() });
          steps = updateStep(steps, 'tts', { status: 'completed', endTime: new Date().toISOString() });
          
          // Step 2: 오디오 길이 측정
          steps = updateStep(steps, 'split', { status: 'processing', startTime: new Date().toISOString() });
          console.log(`[Pipeline] 오디오 길이 측정 중...`);
          const audioDuration = await getAudioDuration(audioPath);
          console.log(`[Pipeline] 오디오 길이: ${audioDuration}초`);
          
          // Step 3: 스크립트 분할 및 유연한 기간 계산 (Veo는 4-8초)
          const sections = splitScriptWithDurations(script, audioDuration, 8, 4, 8);
          console.log(`[Pipeline] 스크립트 ${sections.length}개 섹션으로 분할 완료`);
          steps = updateStep(steps, 'split', { 
            status: 'completed', 
            endTime: new Date().toISOString(),
            result: { sectionCount: sections.length, audioDuration }
          });
          
          // Step 4: 클립 정보 초기화 (계산된 유연한 기간 사용)
          let clips = initializeClipsFromSections(sections);
          
          // Step 5: AI로 영상 프롬프트 생성
          steps = updateStep(steps, 'prompts', { status: 'processing', startTime: new Date().toISOString() });
          await updateJobStatus(job.id, {
            status: 'prompts',
            steps,
            clips,
            audioDuration,
          });
          
          console.log(`[Pipeline] AI 영상 프롬프트 생성 시작...`);
          clips = await generateClipPrompts(clips, topic, category);
          steps = updateStep(steps, 'prompts', { status: 'completed', endTime: new Date().toISOString() });
          
          // Step 6: 영상 생성 요청
          steps = updateStep(steps, 'render', { status: 'processing', startTime: new Date().toISOString() });
          await updateJobStatus(job.id, {
            status: 'render',
            steps,
            clips,
          });
          
          console.log(`[Pipeline] ${clips.length}개 클립 Veo 영상 생성 요청 시작...`);
          clips = await requestClipVideos(clips, 'veo', selectedModel);
          
          // 클립 Job ID들을 brewJobId에 저장
          const jobIds = clips.map(c => c.jobId).filter(Boolean).join(',');
          brewJobId = `multiclip|veo|${selectedModel}|${audioDuration}|${jobIds}`;
          
          await updateJobStatus(job.id, {
            brewJobId,
            steps,
            clips,
          });
          
          console.log(`[Pipeline] Veo 멀티클립 ${clips.length}개 작업 시작됨`);
          
        } else {
          // 일반 모드: 단일 클립 생성
          console.log(`[Pipeline] Google Veo 영상 생성 요청 시작 (모델: ${selectedModel}, 길이: ${selectedDuration}초, 음성포함: ${veoWithAudio})...`);
          
          // Veo 음성 포함 모드: 스크립트를 나레이션 프롬프트로 변환
          let veoPrompt: string;
          if (veoWithAudio) {
            veoPrompt = `[Korean narration video] A warm and friendly Korean narrator reads the following script for a YouTube Shorts video targeting 50-60 year old Korean viewers:

"${script}"

Style: Professional health/lifestyle content, warm lighting, calming visuals, clear Korean speech with natural intonation. The narrator should speak slowly and clearly.`;
            providerName = `Veo (${selectedModel}) + AI 음성 (${selectedDuration}초)`;
          } else {
            veoPrompt = script;
            providerName = `Veo (${selectedModel}) (${selectedDuration}초)`;
          }
          
          const result = await requestVeoVideo({
            prompt: veoPrompt,
            model: selectedModel,
            aspectRatio: '9:16',
            duration: selectedDuration,
          });
          brewJobId = result.jobId;
        }
      } else if (videoProvider === 'kling') {
        // Kling AI 방식
        const selectedDuration = klingDuration || '5';
        console.log(`[Pipeline] Kling AI 영상 생성 요청 시작 (길이: ${selectedDuration}초)...`);
        providerName = `Kling (${selectedDuration}초)`;
        const result = await requestKlingVideo({
          prompt: script,
          aspect_ratio: '9:16',
          duration: selectedDuration,
        });
        brewJobId = result.jobId;
      } else if (videoProvider === 'google') {
        // Google Imagen + FFmpeg 방식
        console.log(`[Pipeline] Google Imagen + FFmpeg 영상 생성 요청 시작...`);
        providerName = 'Google';
        const result = await requestGoogleVideo({
          script,
          audioUrl: audioPath!, // Google은 로컬 경로 사용
          aspectRatio: '9:16',
        });
        brewJobId = result.jobId;
      } else {
        // Runway ML 방식 (기본값)
        console.log(`[Pipeline] Runway 영상 생성 요청 시작...`);
        providerName = 'Runway';
        const result = await requestRunwayVideo({
          script,
          audioUrl: audioUrl!,
          aspectRatio: '9:16',
        });
        brewJobId = result.jobId;
      }

      const updatedJob = await updateJobStatus(job.id, {
        brewJobId,
      });

      console.log(`[Pipeline] ${providerName} 작업 요청 완료: ${brewJobId}`);

      // 응답 반환
      return NextResponse.json<PipelineResponse>({
        success: true,
        job: updatedJob!,
        message: `영상 생성 파이프라인이 시작되었습니다. ${providerName} 렌더링 완료 후 업로드가 진행됩니다.`,
      });

    } catch (pipelineError) {
      // 파이프라인 중 오류 발생 시 Job 상태 업데이트
      const errorMessage = pipelineError instanceof Error 
        ? pipelineError.message 
        : '알 수 없는 오류가 발생했습니다.';

      const failedJob = await updateJobStatus(job.id, {
        status: 'failed',
        errorMessage,
      });

      console.error(`[Pipeline] 오류 발생:`, pipelineError);

      return NextResponse.json<PipelineResponse>({
        success: false,
        job: failedJob!,
        message: errorMessage,
      }, { status: 500 });
    }

  } catch (error) {
    console.error('[Pipeline] 요청 처리 오류:', error);

    const errorMessage = error instanceof Error 
      ? error.message 
      : '요청 처리 중 오류가 발생했습니다.';

    return NextResponse.json<ApiErrorResponse>(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
