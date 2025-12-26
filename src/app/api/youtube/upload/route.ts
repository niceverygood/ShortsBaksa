/**
 * POST /api/youtube/upload
 * 
 * YouTube 영상 업로드 API
 */

import { NextRequest, NextResponse } from 'next/server';
import { uploadToYoutube } from '@/lib/youtube';
import { getJob, updateJobStatus } from '@/lib/jobs';

interface UploadRequest {
  jobId: string;
  videoUrl: string;
  title: string;
  description?: string;
  tags?: string[];
  privacyStatus?: 'public' | 'unlisted' | 'private';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as UploadRequest;
    const { jobId, videoUrl, title, description, tags, privacyStatus = 'public' } = body;

    // 검증
    if (!jobId) {
      return NextResponse.json(
        { success: false, error: '작업 ID가 필요합니다.' },
        { status: 400 }
      );
    }

    if (!videoUrl) {
      return NextResponse.json(
        { success: false, error: '영상 URL이 필요합니다.' },
        { status: 400 }
      );
    }

    if (!title) {
      return NextResponse.json(
        { success: false, error: '제목이 필요합니다.' },
        { status: 400 }
      );
    }

    // 작업 확인
    const job = await getJob(jobId);
    if (!job) {
      return NextResponse.json(
        { success: false, error: '작업을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 이미 업로드된 경우
    if (job.youtubeUrl) {
      return NextResponse.json({
        success: true,
        job,
        message: '이미 YouTube에 업로드되었습니다.',
        youtubeUrl: job.youtubeUrl,
      });
    }

    console.log(`[YouTubeUpload] 업로드 시작: ${jobId}`);
    console.log(`[YouTubeUpload] 제목: ${title}`);

    // 상태 업데이트
    await updateJobStatus(jobId, { status: 'upload' });

    // YouTube 업로드
    const result = await uploadToYoutube({
      videoPathOrUrl: videoUrl,
      title,
      description,
      tags,
      privacyStatus,
    });

    console.log(`[YouTubeUpload] 업로드 완료: ${result.youtubeUrl}`);

    // 작업 상태 업데이트
    const updatedJob = await updateJobStatus(jobId, {
      status: 'completed',
      youtubeUrl: result.youtubeUrl,
      youtubeVideoId: result.youtubeVideoId,
    });

    return NextResponse.json({
      success: true,
      job: updatedJob,
      message: 'YouTube 업로드가 완료되었습니다.',
      youtubeUrl: result.youtubeUrl,
      youtubeVideoId: result.youtubeVideoId,
    });

  } catch (error) {
    console.error('[YouTubeUpload] 오류:', error);

    const errorMessage = error instanceof Error ? error.message : '업로드 중 오류가 발생했습니다.';

    // YouTube 인증 관련 에러 확인
    if (errorMessage.includes('YOUTUBE_') || errorMessage.includes('OAuth') || errorMessage.includes('refresh_token')) {
      return NextResponse.json({
        success: false,
        error: 'YouTube API 인증이 필요합니다.',
        details: errorMessage,
        hint: 'YouTube OAuth 설정을 완료해주세요. (YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN 환경변수 필요)',
      }, { status: 401 });
    }

    return NextResponse.json(
      { 
        success: false, 
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}


