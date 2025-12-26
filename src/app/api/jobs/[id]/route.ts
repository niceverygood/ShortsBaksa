/**
 * GET /api/jobs/[id]
 * 
 * 개별 작업 조회 API
 */

import { NextRequest, NextResponse } from 'next/server';
import { getJob } from '@/lib/jobs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: '작업 ID가 필요합니다.' },
        { status: 400 }
      );
    }

    const job = await getJob(id);

    if (!job) {
      return NextResponse.json(
        { success: false, error: '작업을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      job,
    });
  } catch (error) {
    console.error('[GetJob] 오류:', error);

    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : '작업 조회 중 오류가 발생했습니다.',
      },
      { status: 500 }
    );
  }
}
