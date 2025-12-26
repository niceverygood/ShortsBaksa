/**
 * 쇼츠 타임라인 조립 API
 * 
 * POST /api/shorts/[id]/compose
 * 
 * 모든 씬을 하나의 영상으로 합성합니다.
 */

import { NextResponse } from 'next/server';
import { createTimelineComposer } from '@/timeline/TimelineComposer';
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

    console.log(`[ShortsCompose] 타임라인 조립 시작: ${id}`);

    // TimelineComposer로 합성
    const composer = createTimelineComposer(id, timeline.options);
    
    // 씬들 합성
    const compositionResult = await composer.compose(timeline.scenes);

    // 오디오 추가
    const videoWithAudioPath = await composer.addAudioToVideo(
      compositionResult.outputPath,
      timeline.fullAudioPath!
    );

    // 타임라인 JSON 저장
    const timelineJsonPath = await composer.saveTimelineJson(
      timeline.scenes,
      compositionResult.totalDurationMs
    );

    // 타임라인 업데이트
    timeline.fullVideoPath = videoWithAudioPath;
    timeline.timelineJsonPath = timelineJsonPath;
    timeline.totalDurationMs = compositionResult.totalDurationMs;
    timeline.status = 'composing';
    timeline.currentStep = 'export';
    timeline.updatedAt = new Date().toISOString();

    await saveTimeline(timeline);

    console.log(`[ShortsCompose] 조립 완료: ${compositionResult.totalDurationMs}ms`);

    return NextResponse.json({
      success: true,
      timeline: {
        id: timeline.id,
        status: timeline.status,
        currentStep: timeline.currentStep,
        composedVideoPath: videoWithAudioPath,
        timelineJsonPath,
        totalDurationMs: compositionResult.totalDurationMs,
        scenesIncluded: compositionResult.scenesIncluded,
      },
    });

  } catch (error) {
    console.error('[ShortsCompose] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '타임라인 조립 중 오류가 발생했습니다.',
      },
      { status: 500 }
    );
  }
}

