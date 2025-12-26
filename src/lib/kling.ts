/**
 * Kling AI API Integration
 * 클링 AI를 사용한 텍스트/이미지 -> 비디오 생성
 * 
 * API 문서: https://klingai.com/global/dev
 * 인증: JWT 토큰 방식 (Access Key + Secret Key)
 */

import jwt from 'jsonwebtoken';

// Kling API 엔드포인트
const KLING_API_BASE = 'https://api.klingai.com/v1';

/**
 * JWT 토큰 생성
 */
function generateKlingToken(): string {
  const accessKey = process.env.KLING_ACCESS_KEY;
  const secretKey = process.env.KLING_SECRET_KEY;

  if (!accessKey || !secretKey) {
    throw new Error('KLING_ACCESS_KEY 또는 KLING_SECRET_KEY 환경변수가 설정되지 않았습니다.');
  }

  const now = Math.floor(Date.now() / 1000);
  
  const payload = {
    iss: accessKey,
    exp: now + 1800, // 30분 후 만료
    nbf: now - 5,    // 5초 전부터 유효
  };

  return jwt.sign(payload, secretKey, {
    algorithm: 'HS256',
    header: {
      alg: 'HS256',
      typ: 'JWT',
    },
  });
}

/**
 * Kling API 요청 헤더
 */
function getKlingHeaders(): Record<string, string> {
  const token = generateKlingToken();
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export interface KlingVideoRequest {
  prompt: string;
  negative_prompt?: string;
  model?: 'kling-v1' | 'kling-v1-5' | 'kling-v1-6';
  duration?: '5' | '10'; // Kling API는 5초 또는 10초만 지원
  aspect_ratio?: '16:9' | '9:16' | '1:1';
  cfg_scale?: number;    // 프롬프트 준수도 (0-1)
}

export interface KlingVideoResponse {
  task_id: string;
  status: 'submitted' | 'processing' | 'succeed' | 'failed';
}

export interface KlingVideoResult {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  videoUrl?: string;
  errorMessage?: string;
  progress?: number;
}

/**
 * 텍스트로 비디오 생성 요청
 */
export async function requestKlingVideo(params: KlingVideoRequest): Promise<{ jobId: string }> {
  console.log('[Kling] 영상 생성 요청 시작...');

  const requestBody = {
    model_name: params.model || 'kling-v1',
    prompt: params.prompt,
    negative_prompt: params.negative_prompt || '',
    cfg_scale: params.cfg_scale ?? 0.5,
    duration: params.duration || '5',
    aspect_ratio: params.aspect_ratio || '9:16',
  };

  console.log('[Kling] 요청 데이터:', JSON.stringify(requestBody, null, 2));

  try {
    const response = await fetch(`${KLING_API_BASE}/videos/text2video`, {
      method: 'POST',
      headers: getKlingHeaders(),
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    console.log('[Kling] API 응답:', JSON.stringify(data, null, 2));

    if (!response.ok) {
      throw new Error(`Kling API 오류 (${response.status}): ${data.message || JSON.stringify(data)}`);
    }

    if (data.code !== 0) {
      throw new Error(`Kling API 오류: ${data.message || '알 수 없는 오류'}`);
    }

    const taskId = data.data?.task_id;
    if (!taskId) {
      throw new Error('Kling API에서 task_id를 반환하지 않았습니다.');
    }

    console.log(`[Kling] 작업 생성 완료: ${taskId}`);
    return { jobId: taskId };

  } catch (error) {
    console.error('[Kling] 요청 실패:', error);
    throw error;
  }
}

/**
 * 이미지로 비디오 생성 요청
 */
export async function requestKlingImageToVideo(params: {
  imageUrl: string;
  prompt?: string;
  negative_prompt?: string;
  model?: 'kling-v1' | 'kling-v1-5' | 'kling-v1-6';
  duration?: '5' | '10';
  cfg_scale?: number;
}): Promise<{ jobId: string }> {
  console.log('[Kling] 이미지→비디오 생성 요청 시작...');

  const requestBody = {
    model_name: params.model || 'kling-v1',
    image: params.imageUrl,
    prompt: params.prompt || '',
    negative_prompt: params.negative_prompt || '',
    cfg_scale: params.cfg_scale ?? 0.5,
    duration: params.duration || '5',
  };

  try {
    const response = await fetch(`${KLING_API_BASE}/videos/image2video`, {
      method: 'POST',
      headers: getKlingHeaders(),
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    console.log('[Kling] API 응답:', JSON.stringify(data, null, 2));

    if (!response.ok) {
      throw new Error(`Kling API 오류 (${response.status}): ${data.message || JSON.stringify(data)}`);
    }

    if (data.code !== 0) {
      throw new Error(`Kling API 오류: ${data.message || '알 수 없는 오류'}`);
    }

    const taskId = data.data?.task_id;
    if (!taskId) {
      throw new Error('Kling API에서 task_id를 반환하지 않았습니다.');
    }

    console.log(`[Kling] 작업 생성 완료: ${taskId}`);
    return { jobId: taskId };

  } catch (error) {
    console.error('[Kling] 요청 실패:', error);
    throw error;
  }
}

/**
 * 비디오 생성 상태 확인
 */
export async function getKlingVideoResult(taskId: string): Promise<KlingVideoResult> {
  console.log(`[Kling] 작업 상태 조회: ${taskId}`);

  try {
    const response = await fetch(`${KLING_API_BASE}/videos/text2video/${taskId}`, {
      method: 'GET',
      headers: getKlingHeaders(),
    });

    const data = await response.json();
    console.log('[Kling] 상태 응답:', JSON.stringify(data, null, 2));

    if (!response.ok) {
      throw new Error(`Kling API 오류 (${response.status}): ${data.message || JSON.stringify(data)}`);
    }

    if (data.code !== 0) {
      throw new Error(`Kling API 오류: ${data.message || '알 수 없는 오류'}`);
    }

    const taskData = data.data;
    const status = taskData?.task_status;

    // 상태 매핑
    switch (status) {
      case 'submitted':
      case 'processing':
        return {
          status: 'processing',
          progress: taskData?.task_status_msg ? parseInt(taskData.task_status_msg) : undefined,
        };
      
      case 'succeed':
        const videoUrl = taskData?.task_result?.videos?.[0]?.url;
        if (!videoUrl) {
          return {
            status: 'failed',
            errorMessage: '영상 URL이 반환되지 않았습니다.',
          };
        }
        return {
          status: 'completed',
          videoUrl,
        };
      
      case 'failed':
        return {
          status: 'failed',
          errorMessage: taskData?.task_status_msg || '영상 생성에 실패했습니다.',
        };
      
      default:
        return {
          status: 'pending',
        };
    }

  } catch (error) {
    console.error('[Kling] 상태 조회 실패:', error);
    throw error;
  }
}

/**
 * Kling API 연결 테스트
 */
export async function testKlingConnection(): Promise<boolean> {
  console.log('[Kling] API 연결 테스트...');

  try {
    // 간단한 테스트 요청 (실제로는 크레딧을 소모하지 않는 엔드포인트가 있으면 좋겠지만)
    // 일단 토큰 생성만 테스트
    const token = generateKlingToken();
    console.log('[Kling] JWT 토큰 생성 성공');
    console.log('[Kling] 토큰 길이:', token.length);
    
    // 실제 API 호출 테스트 (계정 정보 조회 등)
    const response = await fetch(`${KLING_API_BASE}/videos/text2video`, {
      method: 'POST',
      headers: getKlingHeaders(),
      body: JSON.stringify({
        model_name: 'kling-v1',
        prompt: 'test',
        duration: '5',
        aspect_ratio: '9:16',
      }),
    });

    const data = await response.json();
    console.log('[Kling] 테스트 응답 코드:', response.status);
    console.log('[Kling] 테스트 응답:', JSON.stringify(data, null, 2));

    // 401/403이 아니면 인증은 성공한 것
    if (response.status === 401 || response.status === 403) {
      console.error('[Kling] 인증 실패');
      return false;
    }

    // 크레딧 부족 등의 오류도 인증은 성공한 것
    if (data.code === 0 || response.ok) {
      console.log('[Kling] API 연결 성공');
      return true;
    }

    // 다른 오류 코드라도 인증이 통과했다면 성공
    console.log('[Kling] API 응답 수신 (인증 성공)');
    return true;

  } catch (error) {
    console.error('[Kling] 연결 테스트 실패:', error);
    return false;
  }
}

