/**
 * Higgsfield AI Video Generation API Integration
 * 
 * Higgsfield는 여러 AI 비디오 모델(Veo 3.1, Sora 2, Kling 등)을 
 * 통합 제공하는 플랫폼입니다.
 * 
 * API 문서: https://docs.higgsfield.ai
 */

// API 설정
const HIGGSFIELD_API_BASE = 'https://platform.higgsfield.ai';

// 지원 모델 - API 경로와 매핑
export type HiggsfieldModel = 
  | 'veo-3.1'
  | 'sora-2'
  | 'kling-2.6'
  | 'wan-2.6'
  | 'minimax-hailuo'
  | 'seedance-1.5';

// 모델별 API 경로 매핑 (Text-to-Video 모델만 사용)
const MODEL_PATHS: Record<HiggsfieldModel, string> = {
  'veo-3.1': 'bytedance/seedance/v1/pro/text-to-video',  // Seedance Pro (가장 안정적)
  'sora-2': 'bytedance/seedance/v1/pro/text-to-video',   // Seedance Pro
  'kling-2.6': 'bytedance/seedance/v1/pro/text-to-video', // Seedance Pro
  'wan-2.6': 'bytedance/seedance/v1/pro/text-to-video',  // Seedance Pro
  'minimax-hailuo': 'bytedance/seedance/v1/pro/text-to-video', // Seedance Pro
  'seedance-1.5': 'bytedance/seedance/v1/pro/text-to-video', // Seedance Pro
};

// 모델별 resolution 형식 (Seedance는 '720' 형식 사용)
const MODEL_RESOLUTION_FORMAT: Record<HiggsfieldModel, string> = {
  'veo-3.1': '720',
  'sora-2': '720',
  'kling-2.6': '720',
  'wan-2.6': '720',
  'minimax-hailuo': '720',
  'seedance-1.5': '720',
};

export interface HiggsfieldVideoRequest {
  prompt: string;
  model?: HiggsfieldModel;
  aspectRatio?: '16:9' | '9:16';
  duration?: number;  // 초 단위
  imageUrl?: string;  // Image-to-Video용
  negativePrompt?: string;
}

export interface HiggsfieldVideoResult {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  videoUrl?: string;
  errorMessage?: string;
  progress?: number;
}

/**
 * Higgsfield API 인증 헤더 생성
 * 인증 형식: Authorization: Key {api_key_id}:{api_key_secret}
 */
function getAuthHeaders(): Record<string, string> {
  const apiKeyId = process.env.HIGGSFIELD_API_KEY_ID;
  const apiKeySecret = process.env.HIGGSFIELD_API_KEY_SECRET;

  if (!apiKeyId || !apiKeySecret) {
    throw new Error('HIGGSFIELD_API_KEY_ID 또는 HIGGSFIELD_API_KEY_SECRET이 설정되지 않았습니다.');
  }

  return {
    'Authorization': `Key ${apiKeyId}:${apiKeySecret}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Higgsfield로 비디오 생성 요청
 */
export async function requestHiggsfieldVideo(params: HiggsfieldVideoRequest): Promise<{ jobId: string }> {
  const headers = getAuthHeaders();
  const model = params.model || 'veo-3.1';
  const modelPath = MODEL_PATHS[model];
  
  console.log(`[Higgsfield] 영상 생성 요청 시작 (모델: ${model}, 경로: ${modelPath})...`);

  // 모델별 resolution 형식 적용
  const resolution = MODEL_RESOLUTION_FORMAT[model] || '720p';
  
  const requestBody = {
    prompt: params.prompt,
    aspect_ratio: params.aspectRatio || '9:16',
    resolution: resolution,
    ...(params.negativePrompt && { negative_prompt: params.negativePrompt }),
  };

  console.log('[Higgsfield] 요청 데이터:', JSON.stringify(requestBody, null, 2));

  try {
    const response = await fetch(`${HIGGSFIELD_API_BASE}/${modelPath}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    console.log('[Higgsfield] API 응답:', JSON.stringify(data, null, 2));

    if (!response.ok) {
      throw new Error(
        `Higgsfield API 오류 (${response.status}): ${data.error?.message || data.message || JSON.stringify(data)}`
      );
    }

    // 응답에서 request_id 추출
    const requestId = data.request_id;
    if (!requestId) {
      throw new Error('Higgsfield API에서 request_id를 반환하지 않았습니다.');
    }

    // status_url도 저장 (나중에 상태 조회에 사용)
    const higgsfieldJobId = `higgsfield|${requestId}`;
    console.log(`[Higgsfield] 작업 생성 완료: ${higgsfieldJobId}`);
    console.log(`[Higgsfield] 상태 URL: ${data.status_url}`);

    return { jobId: higgsfieldJobId };
  } catch (error) {
    console.error('[Higgsfield] 요청 실패:', error);
    throw error;
  }
}

/**
 * Higgsfield 비디오 생성 상태 확인
 */
export async function getHiggsfieldVideoResult(jobId: string): Promise<HiggsfieldVideoResult> {
  const headers = getAuthHeaders();

  // higgsfield| prefix 제거
  const requestId = jobId.replace(/^higgsfield\|/, '');
  console.log(`[Higgsfield] 작업 상태 조회: ${requestId}`);

  try {
    const response = await fetch(`${HIGGSFIELD_API_BASE}/requests/${requestId}/status`, {
      method: 'GET',
      headers,
    });

    const data = await response.json();
    console.log('[Higgsfield] 상태 응답:', JSON.stringify(data, null, 2));

    if (!response.ok) {
      throw new Error(
        `Higgsfield API 오류 (${response.status}): ${data.error?.message || JSON.stringify(data)}`
      );
    }

    // 상태 확인
    const status = data.status?.toLowerCase();
    
    if (status === 'completed' || status === 'done' || status === 'success') {
      // video.url에서 영상 URL 추출
      const videoUrl = data.video?.url || data.output_url || data.result?.url;
      if (videoUrl) {
        console.log(`[Higgsfield] 영상 생성 완료: ${videoUrl}`);
        return {
          status: 'completed',
          videoUrl,
        };
      } else {
        return {
          status: 'failed',
          errorMessage: '영상 URL이 반환되지 않았습니다.',
        };
      }
    }

    if (status === 'failed' || status === 'error' || status === 'cancelled') {
      return {
        status: 'failed',
        errorMessage: data.error?.message || data.message || '영상 생성에 실패했습니다.',
      };
    }

    // queued, processing 등 진행 중
    return {
      status: status === 'queued' ? 'pending' : 'processing',
      progress: data.progress,
    };
  } catch (error) {
    console.error('[Higgsfield] 상태 조회 실패:', error);
    throw error;
  }
}

/**
 * Higgsfield API 연결 테스트
 */
export async function testHiggsfieldConnection(): Promise<boolean> {
  try {
    const apiKeyId = process.env.HIGGSFIELD_API_KEY_ID;
    const apiKeySecret = process.env.HIGGSFIELD_API_KEY_SECRET;

    if (!apiKeyId || !apiKeySecret) {
      console.error('[Higgsfield] API 키가 설정되지 않았습니다.');
      return false;
    }

    console.log('[Higgsfield] API 연결 테스트...');
    console.log('[Higgsfield] API Key ID:', apiKeyId.substring(0, 8) + '...');

    // 간단한 요청으로 인증 테스트
    // Higgsfield Soul Standard 모델로 테스트 (가장 기본)
    const response = await fetch(`${HIGGSFIELD_API_BASE}/higgsfield-ai/soul/standard`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        prompt: 'test connection',
        aspect_ratio: '16:9',
        resolution: '720p',
      }),
    });

    // 성공 또는 quota 에러라도 인증은 성공한 것
    if (response.ok || response.status === 402 || response.status === 429) {
      console.log('[Higgsfield] API 연결 성공');
      return true;
    }

    const data = await response.json();
    console.log('[Higgsfield] 연결 테스트 응답:', JSON.stringify(data, null, 2));
    
    // 401이면 인증 실패
    if (response.status === 401 || response.status === 403) {
      console.error('[Higgsfield] 인증 실패:', response.status);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[Higgsfield] 연결 테스트 실패:', error);
    return false;
  }
}
