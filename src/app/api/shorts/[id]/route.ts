/**
 * 쇼츠 상태 조회 / 씬 재생성 API
 * 
 * GET /api/shorts/[id] - 타임라인 상태 조회
 * PATCH /api/shorts/[id] - 특정 씬 재생성
 */

import { NextResponse } from 'next/server';
import { createSceneManager } from '@/scenes/SceneManager';
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

// GET: 타임라인 상태 조회
export async function GET(
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

    return NextResponse.json({
      success: true,
      timeline: {
        id: timeline.id,
        topic: timeline.topic,
        category: timeline.category,
        status: timeline.status,
        currentStep: timeline.currentStep,
        totalDurationMs: timeline.totalDurationMs,
        targetDurationMs: timeline.targetDurationMs,
        fullAudioPath: timeline.fullAudioPath,
        fullVideoPath: timeline.fullVideoPath,
        timelineJsonPath: timeline.timelineJsonPath,
        options: timeline.options,
        scenes: timeline.scenes.map(s => ({
          id: s.id,
          text: s.text,
          audioPath: s.audioPath,
          audioDurationMs: s.audioDurationMs,
          videoPath: s.videoPath,
          videoDurationMs: s.videoDurationMs,
          videoStatus: s.videoStatus,
          adjustmentType: s.adjustmentType,
          adjustedVideoPath: s.adjustedVideoPath,
          startTimeMs: s.startTimeMs,
          endTimeMs: s.endTimeMs,
          errorMessage: s.errorMessage,
        })),
        createdAt: timeline.createdAt,
        updatedAt: timeline.updatedAt,
      },
    });

  } catch (error) {
    console.error('[ShortsGet] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '조회 중 오류가 발생했습니다.',
      },
      { status: 500 }
    );
  }
}

// PATCH: 특정 씬 재생성
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { sceneId, newPrompt } = body;

    if (!sceneId) {
      return NextResponse.json(
        { success: false, error: 'sceneId가 필요합니다.' },
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

    // 해당 씬 찾기
    const sceneIndex = timeline.scenes.findIndex(s => s.id === sceneId);
    if (sceneIndex === -1) {
      return NextResponse.json(
        { success: false, error: '씬을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    console.log(`[ShortsRetry] 씬 ${sceneId} 재생성 시작`);

    const scene = timeline.scenes[sceneIndex];
    
    // 프롬프트 업데이트
    if (newPrompt) {
      scene.prompt = newPrompt;
    }

    // SceneManager로 재생성
    const sceneManager = createSceneManager({
      jobId: id,
      topic: timeline.topic,
      category: timeline.category || undefined,
      videoProvider: timeline.options.videoAI,
    });

    const retriedScene = await sceneManager.retryScene(scene);
    timeline.scenes[sceneIndex] = retriedScene;
    timeline.updatedAt = new Date().toISOString();

    await saveTimeline(timeline);

    console.log(`[ShortsRetry] 씬 ${sceneId} 재생성 요청 완료`);

    return NextResponse.json({
      success: true,
      scene: {
        id: retriedScene.id,
        text: retriedScene.text,
        prompt: retriedScene.prompt,
        videoStatus: retriedScene.videoStatus,
      },
    });

  } catch (error) {
    console.error('[ShortsRetry] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '씬 재생성 중 오류가 발생했습니다.',
      },
      { status: 500 }
    );
  }
}

