/**
 * 스크립트 수정 API
 * 
 * PUT /api/shorts/[id]/script
 * 
 * 스크립트를 수정하고 씬을 재분할합니다.
 */

import { NextResponse } from 'next/server';
import { getScriptManager } from '@/script/ScriptManager';
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

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { script } = body;

    if (!script || typeof script !== 'string') {
      return NextResponse.json(
        { success: false, error: '스크립트 내용이 필요합니다.' },
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

    console.log(`[ScriptEdit] 스크립트 수정: ${id}`);

    // ScriptManager로 스크립트 재분할
    const scriptManager = getScriptManager();
    const scriptResult = scriptManager.updateScript(script);
    const scenes = scriptManager.createScenesFromSentences(scriptResult.sentences);

    // 타임라인 업데이트
    timeline.scenes = scenes;
    timeline.totalDurationMs = scriptResult.estimatedDurationMs;
    timeline.status = 'script_completed';
    timeline.currentStep = 'audio';
    timeline.updatedAt = new Date().toISOString();

    await saveTimeline(timeline);

    console.log(`[ScriptEdit] 스크립트 수정 완료: ${scenes.length}개 씬`);

    return NextResponse.json({
      success: true,
      timeline: {
        id: timeline.id,
        script: scriptResult.fullScript,
        scenes: scenes.map(s => ({
          id: s.id,
          text: s.text,
          estimatedDurationMs: s.audioDurationMs,
        })),
        estimatedDurationMs: scriptResult.estimatedDurationMs,
      },
    });

  } catch (error) {
    console.error('[ScriptEdit] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '스크립트 수정 중 오류가 발생했습니다.',
      },
      { status: 500 }
    );
  }
}

