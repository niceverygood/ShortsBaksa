/**
 * Google Imagen + FFmpeg를 이용한 영상 생성
 * 
 * Runway의 대안으로 Google Imagen으로 이미지를 생성하고
 * FFmpeg로 영상을 합성합니다.
 */

import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { generateSceneImages } from './imagen';
import { createVideoFromImages, checkFFmpegInstalled } from './ffmpeg';
import { saveVideo, downloadFile, saveTempFile } from './storage';
import type { 
  RequestBrewVideoParams, 
  BrewJobResult, 
  BrewVideoResult 
} from '@/types';

// 진행 중인 작업을 저장하는 Map
const processingJobs = new Map<string, {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  videoUrl?: string;
  errorMessage?: string;
}>();

/**
 * Google Imagen + FFmpeg로 영상 생성을 요청합니다.
 */
export async function requestGoogleVideo(params: RequestBrewVideoParams): Promise<BrewJobResult> {
  const { script, audioUrl } = params;
  
  // FFmpeg 설치 확인
  const ffmpegInstalled = await checkFFmpegInstalled();
  if (!ffmpegInstalled) {
    throw new Error('FFmpeg가 설치되어 있지 않습니다. brew install ffmpeg 명령으로 설치하세요.');
  }

  // 고유 Job ID 생성
  const jobId = `google-${uuidv4()}`;
  
  // 작업 상태 초기화
  processingJobs.set(jobId, {
    status: 'pending',
    progress: 0,
  });

  // 비동기로 영상 생성 시작
  processGoogleVideo(jobId, script, audioUrl).catch(error => {
    console.error(`[GoogleVideo] Job ${jobId} 오류:`, error);
    processingJobs.set(jobId, {
      status: 'failed',
      progress: 0,
      errorMessage: error instanceof Error ? error.message : '영상 생성 실패',
    });
  });

  return { jobId };
}

/**
 * 실제 영상 생성 프로세스 (비동기)
 */
async function processGoogleVideo(
  jobId: string, 
  script: string, 
  audioUrl: string
): Promise<void> {
  const tmpDir = path.join(process.cwd(), 'tmp', jobId);
  
  try {
    // 상태 업데이트: 처리 중
    processingJobs.set(jobId, {
      status: 'processing',
      progress: 10,
    });

    // 1. 오디오 다운로드
    console.log(`[GoogleVideo] 오디오 다운로드 중...`);
    let audioPath: string;
    
    if (audioUrl.startsWith('http')) {
      const audioBuffer = await downloadFile(audioUrl);
      audioPath = await saveTempFile(audioBuffer, `${jobId}-audio.mp3`);
    } else {
      audioPath = audioUrl;
    }

    processingJobs.set(jobId, {
      status: 'processing',
      progress: 20,
    });

    // 2. 장면별 이미지 생성
    console.log(`[GoogleVideo] 이미지 생성 중...`);
    const imagePaths = await generateSceneImages(script, tmpDir, 5);

    processingJobs.set(jobId, {
      status: 'processing',
      progress: 60,
    });

    // 3. FFmpeg로 영상 합성
    console.log(`[GoogleVideo] 영상 합성 중...`);
    const outputFileName = `shorts-google-${jobId}.mp4`;
    const outputPath = path.join(process.cwd(), 'public', 'videos', outputFileName);

    await createVideoFromImages(imagePaths, audioPath, outputPath, {
      width: 720,
      height: 1280,
      fps: 30,
      transition: 'fade',
    });

    processingJobs.set(jobId, {
      status: 'processing',
      progress: 90,
    });

    // 4. 결과 URL 생성
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3002';
    const videoUrl = `${baseUrl}/videos/${outputFileName}`;

    // 5. 완료 상태 업데이트
    processingJobs.set(jobId, {
      status: 'completed',
      progress: 100,
      videoUrl,
    });

    console.log(`[GoogleVideo] Job ${jobId} 완료: ${videoUrl}`);

  } catch (error) {
    console.error(`[GoogleVideo] Job ${jobId} 실패:`, error);
    processingJobs.set(jobId, {
      status: 'failed',
      progress: 0,
      errorMessage: error instanceof Error ? error.message : '영상 생성 실패',
    });
    throw error;
  }
}

/**
 * Google 영상 생성 작업의 상태를 조회합니다.
 */
export async function getGoogleVideoResult(jobId: string): Promise<BrewVideoResult> {
  const job = processingJobs.get(jobId);
  
  if (!job) {
    return {
      status: 'failed',
      errorMessage: '해당 작업을 찾을 수 없습니다.',
    };
  }

  const result: BrewVideoResult = {
    status: job.status,
  };

  if (job.status === 'completed' && job.videoUrl) {
    result.videoUrl = job.videoUrl;
  } else if (job.status === 'failed') {
    result.errorMessage = job.errorMessage;
  }

  return result;
}

/**
 * 작업 진행률을 조회합니다.
 */
export function getGoogleVideoProgress(jobId: string): number {
  const job = processingJobs.get(jobId);
  return job?.progress || 0;
}

// 기존 brew.ts와의 호환성을 위한 별칭
export const requestBrewVideo = requestGoogleVideo;
export const getBrewVideoResult = getGoogleVideoResult;





