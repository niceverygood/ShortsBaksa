/**
 * GET /api/jobs
 * 
 * Job 목록 조회 API
 */

import { NextRequest, NextResponse } from 'next/server';
import { listJobs } from '@/lib/jobs';
import type { JobsListResponse, ApiErrorResponse } from '@/types';

export async function GET(request: NextRequest) {
  try {
    // Query 파라미터 파싱
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');

    const limit = limitParam ? parseInt(limitParam, 10) : 20;
    const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

    // 검증
    if (isNaN(limit) || limit < 1 || limit > 100) {
      return NextResponse.json<ApiErrorResponse>(
        { success: false, error: 'limit은 1-100 사이의 숫자여야 합니다.' },
        { status: 400 }
      );
    }

    if (isNaN(offset) || offset < 0) {
      return NextResponse.json<ApiErrorResponse>(
        { success: false, error: 'offset은 0 이상의 숫자여야 합니다.' },
        { status: 400 }
      );
    }

    // Job 목록 조회
    const { jobs, total } = await listJobs(limit, offset);

    return NextResponse.json<JobsListResponse>({
      success: true,
      jobs,
      total,
    });

  } catch (error) {
    console.error('[Jobs] 목록 조회 오류:', error);

    const errorMessage = error instanceof Error 
      ? error.message 
      : 'Job 목록 조회 중 오류가 발생했습니다.';

    return NextResponse.json<ApiErrorResponse>(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}





