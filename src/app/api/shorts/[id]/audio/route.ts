/**
 * 쇼츠 음성 생성 API
 * 
 * POST /api/shorts/[id]/audio
 * 
 * 모든 씬의 음성을 생성하고 타임라인을 업데이트합니다.
 */

import { NextResponse } from 'next/server';
import { createAudioManager } from '@/audio/AudioManager';
import type { Timeline, Scene } from '@/core/types';
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
    
    // 타임라인 로드
    const timeline = await loadTimeline(id);
    if (!timeline) {
      return NextResponse.json(
        { success: false, error: '작업을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    console.log(`[ShortsAudio] 음성 생성 시작: ${id}`);

    // AudioManager로 음성 생성
    const audioManager = createAudioManager(id);
    const audioResult = await audioManager.generateAudio(timeline.scenes);

    // 씬 업데이트
    const updatedScenes = audioManager.updateScenesWithAudio(timeline.scenes, audioResult.segments);

    // 타임라인 업데이트
    timeline.scenes = updatedScenes;
    timeline.fullAudioPath = audioResult.fullAudioPath;
    timeline.totalDurationMs = audioResult.fullAudioDurationMs;
    timeline.status = 'audio_completed';
    timeline.currentStep = 'scenes';
    timeline.updatedAt = new Date().toISOString();

    // 타임라인 JSON 저장
    const timelineJsonPath = await audioManager.saveTimelineJson(audioResult.segments);
    timeline.timelineJsonPath = timelineJsonPath;

    await saveTimeline(timeline);

    console.log(`[ShortsAudio] 음성 생성 완료: ${audioResult.fullAudioDurationMs}ms`);

    return NextResponse.json({
      success: true,
      timeline: {
        id: timeline.id,
        status: timeline.status,
        currentStep: timeline.currentStep,
        totalDurationMs: timeline.totalDurationMs,
        fullAudioPath: timeline.fullAudioPath,
        scenes: timeline.scenes.map(s => ({
          id: s.id,
          text: s.text,
          audioPath: s.audioPath,
          audioDurationMs: s.audioDurationMs,
          startTimeMs: s.startTimeMs,
          endTimeMs: s.endTimeMs,
        })),
      },
    });

  } catch (error) {
    console.error('[ShortsAudio] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '음성 생성 중 오류가 발생했습니다.',
      },
      { status: 500 }
    );
  }
}

