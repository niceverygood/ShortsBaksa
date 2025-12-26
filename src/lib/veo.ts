/**
 * Google Veo 3 API Integration
 * Google의 최신 AI 비디오 생성 모델
 * 
 * 지원 모델:
 * - veo-3.0-generate-001 (Veo 3)
 * - veo-3.0-fast-generate-001 (Veo 3 Fast)
 * - veo-3.1-generate-preview (Veo 3.1 Preview)
 */

const VEO_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// Veo 모델 타입
export type VeoModel = 'veo-3' | 'veo-3-fast' | 'veo-3.1';

// 모델 이름 매핑
const MODEL_MAP: Record<VeoModel, string> = {
  'veo-3': 'models/veo-3.0-generate-001',
  'veo-3-fast': 'models/veo-3.0-fast-generate-001',
  'veo-3.1': 'models/veo-3.1-generate-preview',
};

export interface VeoVideoRequest {
  prompt: string;
  model?: VeoModel;
  aspectRatio?: '16:9' | '9:16';
  duration?: number; // 초 단위: 4, 6, 8, 10, 15, 30, 60
  negativePrompt?: string;
}

export interface VeoVideoResult {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  videoUrl?: string;
  errorMessage?: string;
  progress?: number;
}

interface VeoOperation {
  name: string;
  done: boolean;
  error?: {
    code: number;
    message: string;
  };
  response?: {
    '@type'?: string;
    generateVideoResponse?: {
      generatedSamples?: Array<{
        video?: {
          uri: string;
        };
      }>;
    };
  };
  metadata?: {
    '@type': string;
  };
}

/**
 * Veo3로 비디오 생성 요청
 */
export async function requestVeoVideo(params: VeoVideoRequest): Promise<{ jobId: string }> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_AI_API_KEY 환경변수가 설정되지 않았습니다.');
  }

  const model = MODEL_MAP[params.model || 'veo-3'];
  console.log(`[Veo] 영상 생성 요청 시작 (모델: ${model})...`);

  const requestBody = {
    instances: [
      {
        prompt: params.prompt,
      },
    ],
    parameters: {
      aspectRatio: params.aspectRatio || '9:16',
      ...(params.duration && { durationSeconds: params.duration }),
      ...(params.negativePrompt && { negativePrompt: params.negativePrompt }),
    },
  };

  console.log('[Veo] 요청 데이터:', JSON.stringify(requestBody, null, 2));

  try {
    const response = await fetch(
      `${VEO_API_BASE}/${model}:predictLongRunning?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      }
    );

    const data = await response.json();
    console.log('[Veo] API 응답:', JSON.stringify(data, null, 2));

    if (!response.ok) {
      throw new Error(
        `Veo API 오류 (${response.status}): ${data.error?.message || JSON.stringify(data)}`
      );
    }

    // Long Running Operation 이름 (전체 경로 사용)
    // 예: models/veo-3.0-generate-001/operations/xxx
    const operationName = data.name;
    if (!operationName) {
      throw new Error('Veo API에서 operation name을 반환하지 않았습니다.');
    }

    // operation 전체 경로를 jobId로 사용 (veo| prefix 추가하여 구분)
    const jobId = `veo|${operationName}`;
    console.log(`[Veo] 작업 생성 완료: ${jobId}`);

    return { jobId };
  } catch (error) {
    console.error('[Veo] 요청 실패:', error);
    throw error;
  }
}

/**
 * Veo 비디오 생성 상태 확인
 */
export async function getVeoVideoResult(jobId: string): Promise<VeoVideoResult> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_AI_API_KEY 환경변수가 설정되지 않았습니다.');
  }

  // veo| prefix 제거하여 전체 operation 경로 추출
  // 예: veo|models/veo-3.0-generate-001/operations/xxx -> models/veo-3.0-generate-001/operations/xxx
  const operationPath = jobId.replace(/^veo\|/, '').replace(/^veo-/, '');
  console.log(`[Veo] 작업 상태 조회: ${operationPath}`);

  try {
    const response = await fetch(
      `${VEO_API_BASE}/${operationPath}?key=${apiKey}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    const data: VeoOperation = await response.json();
    console.log('[Veo] 상태 응답:', JSON.stringify(data, null, 2));

    if (!response.ok) {
      throw new Error(
        `Veo API 오류 (${response.status}): ${(data as any).error?.message || JSON.stringify(data)}`
      );
    }

    // 에러 확인
    if (data.error) {
      return {
        status: 'failed',
        errorMessage: data.error.message || '알 수 없는 오류가 발생했습니다.',
      };
    }

    // 작업 완료 확인
    if (data.done) {
      // Veo API 응답 구조: response.generateVideoResponse.generatedSamples[0].video.uri
      const videoUri = data.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
      
      if (videoUri) {
        // API 키를 URL에 추가하여 다운로드 가능하게 만듦
        const apiKey = process.env.GOOGLE_AI_API_KEY;
        const downloadUrl = videoUri.includes('?') 
          ? `${videoUri}&key=${apiKey}` 
          : `${videoUri}?key=${apiKey}`;
        
        console.log(`[Veo] 영상 생성 완료: ${downloadUrl}`);
        return {
          status: 'completed',
          videoUrl: downloadUrl,
        };
      } else {
        console.error('[Veo] 응답에서 영상 URL을 찾을 수 없음:', JSON.stringify(data.response, null, 2));
        return {
          status: 'failed',
          errorMessage: '영상 URL이 반환되지 않았습니다.',
        };
      }
    }

    // 아직 처리 중
    return {
      status: 'processing',
    };
  } catch (error) {
    console.error('[Veo] 상태 조회 실패:', error);
    throw error;
  }
}

/**
 * Veo API 연결 테스트
 */
export async function testVeoConnection(): Promise<boolean> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    console.error('[Veo] GOOGLE_AI_API_KEY가 설정되지 않았습니다.');
    return false;
  }

  console.log('[Veo] API 연결 테스트...');

  try {
    // 모델 목록에서 Veo 모델 확인
    const response = await fetch(
      `${VEO_API_BASE}/models?key=${apiKey}`
    );
    const data = await response.json();

    const veoModels = (data.models || []).filter((m: any) =>
      m.name.toLowerCase().includes('veo')
    );

    if (veoModels.length > 0) {
      console.log('[Veo] 사용 가능한 Veo 모델:', veoModels.map((m: any) => m.name).join(', '));
      return true;
    } else {
      console.error('[Veo] Veo 모델을 찾을 수 없습니다.');
      return false;
    }
  } catch (error) {
    console.error('[Veo] 연결 테스트 실패:', error);
    return false;
  }
}

