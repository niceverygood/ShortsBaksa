/**
 * Brew(브루) AI 영상 생성 API 클라이언트
 * 
 * 스크립트와 오디오를 기반으로 9:16 쇼츠 영상을 생성합니다.
 * 
 * NOTE: 실제 Brew API 스펙에 맞게 엔드포인트와 요청/응답 형식을 수정해야 할 수 있습니다.
 */

import axios from 'axios';
import type { 
  RequestBrewVideoParams, 
  BrewJobResult, 
  BrewVideoResult,
  BrewVideoStatus 
} from '@/types';

// Brew API 기본 URL (실제 API 문서에 따라 수정 필요)
const BREW_API_BASE = 'https://api.brew.com/v1';

/**
 * 환경변수에서 API 키를 가져옵니다.
 */
function getApiKey(): string {
  const apiKey = process.env.BREW_API_KEY;
  if (!apiKey) {
    throw new Error('BREW_API_KEY 환경변수가 설정되지 않았습니다.');
  }
  return apiKey;
}

/**
 * 프로젝트 ID를 가져옵니다.
 */
function getProjectId(): string {
  const projectId = process.env.BREW_PROJECT_ID;
  if (!projectId) {
    throw new Error('BREW_PROJECT_ID 환경변수가 설정되지 않았습니다.');
  }
  return projectId;
}

/**
 * 템플릿 ID를 가져옵니다. (선택적)
 */
function getTemplateId(): string | undefined {
  return process.env.BREW_TEMPLATE_ID;
}

/**
 * Brew API에 영상 생성을 요청합니다.
 * 
 * @param params - 영상 생성 파라미터
 * @returns Brew Job ID
 * 
 * TODO: 실제 Brew API 스펙에 맞게 요청 형식 수정 필요
 */
export async function requestBrewVideo(params: RequestBrewVideoParams): Promise<BrewJobResult> {
  const { script, audioUrl, aspectRatio = '9:16' } = params;
  
  const apiKey = getApiKey();
  const projectId = getProjectId();
  const templateId = getTemplateId();
  
  // 요청 본문 (Brew API 스펙에 맞게 수정 필요)
  const requestBody = {
    project_id: projectId,
    template_id: templateId,
    script: script,
    audio_url: audioUrl,
    aspect_ratio: aspectRatio,
    // 추가 옵션들
    output_format: 'mp4',
    quality: 'high',
    // 50-60대 타겟에 맞는 스타일 설정
    style: {
      text_size: 'large',       // 큰 자막
      text_speed: 'slow',       // 느린 자막 속도
      transition: 'smooth',     // 부드러운 전환
    }
  };

  try {
    const response = await axios.post(
      `${BREW_API_BASE}/videos/generate`,
      requestBody,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    // 응답에서 Job ID 추출 (실제 API 응답 형식에 맞게 수정 필요)
    const jobId = response.data.job_id || response.data.id;
    
    if (!jobId) {
      throw new Error('Brew API에서 Job ID를 반환하지 않았습니다.');
    }

    return { jobId };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const statusCode = error.response?.status;
      const errorMessage = error.response?.data?.message || error.response?.data?.error || error.message;
      throw new Error(`Brew API 오류 (${statusCode}): ${errorMessage}`);
    }
    throw error;
  }
}

/**
 * Brew 영상 생성 작업의 상태를 조회합니다.
 * 
 * @param jobId - Brew Job ID
 * @returns 작업 상태 및 결과
 * 
 * TODO: 실제 Brew API 스펙에 맞게 응답 파싱 수정 필요
 */
export async function getBrewVideoResult(jobId: string): Promise<BrewVideoResult> {
  const apiKey = getApiKey();

  try {
    const response = await axios.get(
      `${BREW_API_BASE}/videos/${jobId}`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      }
    );

    const data = response.data;
    
    // 상태 매핑 (실제 API 응답에 맞게 수정 필요)
    const statusMap: Record<string, BrewVideoStatus> = {
      'pending': 'pending',
      'queued': 'pending',
      'processing': 'processing',
      'rendering': 'processing',
      'completed': 'completed',
      'done': 'completed',
      'success': 'completed',
      'failed': 'failed',
      'error': 'failed',
    };

    const rawStatus = (data.status || '').toLowerCase();
    const status: BrewVideoStatus = statusMap[rawStatus] || 'pending';

    const result: BrewVideoResult = {
      status,
    };

    if (status === 'completed') {
      // 완료된 경우 영상 URL 추출
      result.videoUrl = data.video_url || data.output_url || data.download_url;
    } else if (status === 'failed') {
      // 실패한 경우 에러 메시지 추출
      result.errorMessage = data.error || data.message || '영상 생성에 실패했습니다.';
    }

    return result;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const statusCode = error.response?.status;
      
      // 404는 아직 작업이 준비되지 않은 것으로 처리
      if (statusCode === 404) {
        return { status: 'pending' };
      }
      
      const errorMessage = error.response?.data?.message || error.response?.data?.error || error.message;
      throw new Error(`Brew API 오류 (${statusCode}): ${errorMessage}`);
    }
    throw error;
  }
}

/**
 * 영상 렌더링 진행률을 조회합니다. (선택적)
 * 
 * @param jobId - Brew Job ID
 * @returns 진행률 (0-100)
 */
export async function getBrewVideoProgress(jobId: string): Promise<number> {
  const apiKey = getApiKey();

  try {
    const response = await axios.get(
      `${BREW_API_BASE}/videos/${jobId}/progress`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      }
    );

    return response.data.progress || 0;
  } catch {
    // 진행률 조회 실패 시 0 반환
    return 0;
  }
}





