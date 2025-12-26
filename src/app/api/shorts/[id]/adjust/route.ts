/**
 * 쇼츠 영상 보정 API
 * 
 * POST /api/shorts/[id]/adjust
 * 
 * 모든 씬의 영상 길이를 음성에 맞게 보정합니다.
 */

import { NextResponse } from 'next/server';
import { createVideoManager } from '@/video/VideoManager';
import type { Timeline } from '@/core/types';
import fs from 'fs/promises';
import path from 'path';

const JOBS_DIR = path.join(process.cwd(), 'data', 'shorts');

async function loadTimeline(id: string): Promise<Timeline | null> {
  try {
    const filePath = path.join(JOBS_DIR, `${id}.json`);
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function saveTimeline(timeline: Timeline): Promise<void> {
  const filePath = path.join(JOBS_DIR, `${timeline.id}.json`);
  await fs.writeFile(filePath, JSON.stringify(timeline, null, 2));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const timeline = await loadTimeline(id);
    if (!timeline) {
      return NextResponse.json(
        { success: false, error: '작업을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    console.log(`[ShortsAdjust] 영상 보정 시작: ${id}`);

    // VideoManager로 보정
    const videoManager = createVideoManager(id);
    const adjustedScenes = await videoManager.adjustAllScenes(timeline.scenes);

    // 보정 결과 요약
    const adjustmentSummary = adjustedScenes.reduce((acc, s) => {
      const type = s.adjustmentType || 'none';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // 타임라인 업데이트
    timeline.scenes = adjustedScenes;
    timeline.status = 'video_adjusted';
    timeline.currentStep = 'timeline';
    timeline.updatedAt = new Date().toISOString();

    await saveTimeline(timeline);

    console.log(`[ShortsAdjust] 보정 완료:`, adjustmentSummary);

    return NextResponse.json({
      success: true,
      timeline: {
        id: timeline.id,
        status: timeline.status,
        currentStep: timeline.currentStep,
        scenes: adjustedScenes.map(s => ({
          id: s.id,
          text: s.text,
          prompt: s.prompt,
          videoStatus: s.videoStatus,
          videoPath: s.videoPath,
          adjustedVideoPath: s.adjustedVideoPath,
          adjustmentType: s.adjustmentType,
          audioDurationMs: s.audioDurationMs,
          videoDurationMs: s.videoDurationMs,
        })),
        adjustmentSummary,
      },
    });

  } catch (error) {
    console.error('[ShortsAdjust] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '영상 보정 중 오류가 발생했습니다.',
      },
      { status: 500 }
    );
  }
}

