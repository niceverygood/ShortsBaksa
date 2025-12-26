/**
 * 스크립트 분할 확정 API
 * 
 * PUT /api/shorts/[id]/split
 * 
 * 분할된 씬 목록을 저장합니다.
 */

import { NextResponse } from 'next/server';
import type { Timeline, Scene } from '@/core/types';
import fs from 'fs/promises';
import path from 'path';

const JOBS_DIR = path.join(process.cwd(), 'data', 'shorts');

// 한국어 TTS 기준 초당 글자 수
const CHARS_PER_SECOND = 4.5;

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

function calculateEstimatedMs(text: string): number {
  const charCount = text.replace(/\s/g, '').length;
  return Math.round((charCount / CHARS_PER_SECOND) * 1000);
}

interface SplitRequest {
  scenes: {
    id: number;
    text: string;
  }[];
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json() as SplitRequest;
    const { scenes: inputScenes } = body;

    if (!inputScenes || inputScenes.length === 0) {
      return NextResponse.json(
        { success: false, error: '최소 1개의 씬이 필요합니다.' },
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

    console.log(`[Split] 스크립트 분할 확정: ${id}`);

    // 씬 생성
    const scenes: Scene[] = inputScenes.map((s, index) => ({
      id: index + 1,
      text: s.text.trim(),
      audioDurationMs: calculateEstimatedMs(s.text),
      videoStatus: 'pending' as const,
    }));

    // 총 예상 길이 계산
    const totalDurationMs = scenes.reduce((sum, s) => sum + s.audioDurationMs, 0);

    // 타임라인 업데이트
    timeline.scenes = scenes;
    timeline.totalDurationMs = totalDurationMs;
    timeline.status = 'script_completed';
    timeline.currentStep = 'audio';
    timeline.updatedAt = new Date().toISOString();

    await saveTimeline(timeline);

    console.log(`[Split] 분할 완료: ${scenes.length}개 씬, 예상 ${Math.round(totalDurationMs / 1000)}초`);

    return NextResponse.json({
      success: true,
      timeline: {
        id: timeline.id,
        scenes: scenes.map(s => ({
          id: s.id,
          text: s.text,
          audioDurationMs: s.audioDurationMs,
        })),
        estimatedDurationMs: totalDurationMs,
      },
    });

  } catch (error) {
    console.error('[Split] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '분할 중 오류가 발생했습니다.',
      },
      { status: 500 }
    );
  }
}

