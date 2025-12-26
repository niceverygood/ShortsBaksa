/**
 * 씬별 음성 속도 조절 및 합치기 API
 * 
 * PUT /api/shorts/[id]/audio/adjust
 * 
 * 각 씬의 음성 길이를 조절하고 전체 음성을 재생성합니다.
 */

import { NextResponse } from 'next/server';
import { adjustAudioSpeed, mergeAudios, getAudioDuration } from '@/lib/ffmpeg';
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

interface AdjustmentRequest {
  sceneAdjustments: {
    sceneId: number;
    targetDurationMs: number;
  }[];
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json() as AdjustmentRequest;
    const { sceneAdjustments } = body;

    if (!sceneAdjustments || sceneAdjustments.length === 0) {
      return NextResponse.json(
        { success: false, error: '조절할 씬 정보가 필요합니다.' },
        { status: 400 }
      );
    }

    const timeline = await loadTimeline(id);
    if (!timeline) {
      return NextResponse.json(
        { success: false, error: '작업을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    console.log(`[AudioAdjust] 음성 속도 조절 시작: ${id}`);

    // 출력 디렉토리
    const audioDir = path.join(process.cwd(), 'public', 'audio', 'jobs', id);
    const adjustedDir = path.join(audioDir, 'adjusted');
    await fs.mkdir(adjustedDir, { recursive: true });

    const adjustedPaths: string[] = [];
    let totalDurationMs = 0;

    // 각 씬별로 속도 조절
    for (const adjustment of sceneAdjustments) {
      const scene = timeline.scenes.find(s => s.id === adjustment.sceneId);
      if (!scene || !scene.audioPath) {
        console.warn(`[AudioAdjust] 씬 ${adjustment.sceneId} 건너뜀 (오디오 없음)`);
        continue;
      }

      const inputPath = path.join(process.cwd(), 'public', scene.audioPath);
      const outputFileName = `scene_${String(scene.id).padStart(2, '0')}_adjusted.mp3`;
      const outputPath = path.join(adjustedDir, outputFileName);

      const targetDurationSec = adjustment.targetDurationMs / 1000;
      
      // 속도 조절
      const actualDuration = await adjustAudioSpeed(inputPath, outputPath, targetDurationSec);
      const actualDurationMs = Math.round(actualDuration * 1000);

      // 씬 업데이트
      scene.audioPath = `/audio/jobs/${id}/adjusted/${outputFileName}`;
      scene.audioDurationMs = actualDurationMs;
      
      adjustedPaths.push(outputPath);
      totalDurationMs += actualDurationMs;

      console.log(`  [씬 ${scene.id}] ${Math.round(adjustment.targetDurationMs)}ms → ${actualDurationMs}ms`);
    }

    // 조절되지 않은 씬들도 포함하여 전체 음성 합치기
    const allAudioPaths: string[] = [];
    for (const scene of timeline.scenes.sort((a, b) => a.id - b.id)) {
      if (scene.audioPath) {
        const fullPath = path.join(process.cwd(), 'public', scene.audioPath);
        allAudioPaths.push(fullPath);
      }
    }

    // 전체 음성 합치기
    if (allAudioPaths.length > 0) {
      const fullAudioPath = path.join(audioDir, 'full_audio_adjusted.mp3');
      const fullDuration = await mergeAudios(allAudioPaths, fullAudioPath);
      
      timeline.fullAudioPath = `/audio/jobs/${id}/full_audio_adjusted.mp3`;
      timeline.totalDurationMs = Math.round(fullDuration * 1000);
      
      console.log(`[AudioAdjust] 전체 음성 합침: ${timeline.totalDurationMs}ms`);
    }

    timeline.updatedAt = new Date().toISOString();
    await saveTimeline(timeline);

    console.log(`[AudioAdjust] 완료`);

    return NextResponse.json({
      success: true,
      timeline: {
        id: timeline.id,
        totalDurationMs: timeline.totalDurationMs,
        fullAudioPath: timeline.fullAudioPath,
        scenes: timeline.scenes.map(s => ({
          id: s.id,
          text: s.text,
          audioPath: s.audioPath,
          audioDurationMs: s.audioDurationMs,
        })),
      },
    });

  } catch (error) {
    console.error('[AudioAdjust] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '음성 속도 조절 중 오류가 발생했습니다.',
      },
      { status: 500 }
    );
  }
}

