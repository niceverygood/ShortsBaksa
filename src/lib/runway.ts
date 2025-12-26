/**
 * Runway ML API를 이용한 영상 생성
 * 
 * 스크립트를 기반으로 AI 영상을 생성합니다.
 */

import RunwayML from '@runwayml/sdk';
import type { 
  RequestBrewVideoParams, 
  BrewJobResult, 
  BrewVideoResult,
  BrewVideoStatus 
} from '@/types';

// Runway 클라이언트 (lazy initialization)
let runwayClient: RunwayML | null = null;

function getRunwayClient(): RunwayML {
  if (!runwayClient) {
    const apiKey = process.env.RUNWAY_API_KEY;
    if (!apiKey) {
      throw new Error('RUNWAY_API_KEY 환경변수가 설정되지 않았습니다.');
    }
    runwayClient = new RunwayML({ apiKey });
  }
  return runwayClient;
}

/**
 * 스크립트에서 영상 생성을 위한 프롬프트를 추출합니다.
 */
function extractVideoPrompt(script: string): string {
  // 스크립트의 핵심 내용을 영상 프롬프트로 변환
  // 50-60대 타겟에 맞는 차분하고 전문적인 영상 스타일
  const baseStyle = "Professional Korean educational video, warm and trustworthy tone, clean modern background, soft lighting, high quality 4K, vertical 9:16 aspect ratio for YouTube Shorts";
  
  // 스크립트에서 주요 키워드 추출 (간단한 방식)
  const keywords = script
    .split(/[.,!?]/)
    .slice(0, 3)
    .join(' ')
    .substring(0, 200);
  
  return `${baseStyle}. Topic: ${keywords}`;
}

/**
 * Runway API를 통해 영상 생성을 요청합니다.
 * 
 * @param params - 영상 생성 파라미터
 * @returns Job ID
 */
export async function requestRunwayVideo(params: RequestBrewVideoParams): Promise<BrewJobResult> {
  const { script } = params;
  
  const client = getRunwayClient();
  const prompt = extractVideoPrompt(script);

  try {
    // Runway Veo3으로 영상 생성
    const task = await client.textToVideo.create({
      model: 'veo3',
      promptText: prompt,
      duration: 8, // veo3는 8초 고정
      ratio: '720:1280', // 9:16 세로 비율 (쇼츠용)
    });

    if (!task.id) {
      throw new Error('Runway에서 Task ID를 반환하지 않았습니다.');
    }

    console.log(`[Runway] 영상 생성 작업 시작: ${task.id}`);

    return { jobId: task.id };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Runway API 오류: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Runway 영상 생성 작업의 상태를 조회합니다.
 * 
 * @param jobId - Runway Task ID
 * @returns 작업 상태 및 결과
 */
export async function getRunwayVideoResult(jobId: string): Promise<BrewVideoResult> {
  const client = getRunwayClient();

  try {
    const task = await client.tasks.retrieve(jobId) as any;

    // 상태 매핑
    const statusMap: Record<string, BrewVideoStatus> = {
      'PENDING': 'pending',
      'THROTTLED': 'pending',
      'RUNNING': 'processing',
      'SUCCEEDED': 'completed',
      'FAILED': 'failed',
      'CANCELLED': 'failed',
    };

    const status: BrewVideoStatus = statusMap[task.status] || 'pending';

    const result: BrewVideoResult = { status };

    if (status === 'completed' && task.output) {
      // 출력 URL 추출
      const outputs = task.output as string[];
      if (outputs && outputs.length > 0) {
        result.videoUrl = outputs[0];
      }
    } else if (status === 'failed') {
      result.errorMessage = task.failure || '영상 생성에 실패했습니다.';
    }

    console.log(`[Runway] 작업 상태: ${task.status}, 진행률: ${task.progress || 0}%`);

    return result;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Runway API 오류: ${error.message}`);
    }
    throw error;
  }
}

/**
 * 영상 생성 작업이 완료될 때까지 폴링합니다.
 * 
 * @param jobId - Runway Task ID
 * @param maxWaitMs - 최대 대기 시간 (기본 5분)
 * @param intervalMs - 폴링 간격 (기본 5초)
 */
export async function waitForRunwayVideo(
  jobId: string,
  maxWaitMs = 300000,
  intervalMs = 5000
): Promise<BrewVideoResult> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const result = await getRunwayVideoResult(jobId);

    if (result.status === 'completed' || result.status === 'failed') {
      return result;
    }

    // 대기
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  return {
    status: 'failed',
    errorMessage: '영상 생성 시간이 초과되었습니다.',
  };
}

// 기존 brew.ts와의 호환성을 위한 별칭
export const requestBrewVideo = requestRunwayVideo;
export const getBrewVideoResult = getRunwayVideoResult;

