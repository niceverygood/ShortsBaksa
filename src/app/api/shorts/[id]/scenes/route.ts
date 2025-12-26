/**
 * 쇼츠 씬 영상 생성 API
 * 
 * POST /api/shorts/[id]/scenes - 모든 씬 영상 생성 요청
 * GET /api/shorts/[id]/scenes - 씬 상태 확인
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

// POST: 씬 영상 생성 요청
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // body에서 옵션 읽기
    let body: { videoAI?: string; higgsfieldModel?: string } = {};
    try {
      body = await request.json();
    } catch {
      // body가 없을 수 있음
    }
    
    const timeline = await loadTimeline(id);
    if (!timeline) {
      return NextResponse.json(
        { success: false, error: '작업을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // body에서 받은 옵션으로 업데이트
    if (body.videoAI) {
      timeline.options.videoAI = body.videoAI as 'veo' | 'higgsfield';
    }
    if (body.higgsfieldModel) {
      timeline.options.higgsfieldModel = body.higgsfieldModel;
    }

    console.log(`[ShortsScenes] 씬 영상 생성 시작: ${id}`);
    console.log(`[ShortsScenes] Video AI: ${timeline.options.videoAI}`);
    if (timeline.options.videoAI === 'higgsfield') {
      console.log(`[ShortsScenes] Higgsfield 모델: ${timeline.options.higgsfieldModel || 'seedance-1.5'}`);
    }

    // SceneManager 생성
    const sceneManager = createSceneManager({
      jobId: id,
      topic: timeline.topic,
      category: timeline.category || undefined,
      videoProvider: timeline.options.videoAI,
      videoGenerationMode: timeline.options.videoGenerationMode,
      higgsfieldModel: timeline.options.higgsfieldModel,
    });

    // 1. 프롬프트 생성
    console.log(`[ShortsScenes] Step 1: 프롬프트 생성`);
    let scenes = await sceneManager.generatePrompts(timeline.scenes);

    // 2. 영상 생성 요청
    console.log(`[ShortsScenes] Step 2: 영상 생성 요청`);
    scenes = await sceneManager.requestVideos(scenes);

    // 타임라인 업데이트
    timeline.scenes = scenes;
    timeline.status = 'scenes_generating';
    timeline.currentStep = 'scenes';
    timeline.updatedAt = new Date().toISOString();

    await saveTimeline(timeline);

    const summary = sceneManager.getScenesSummary(scenes);
    console.log(`[ShortsScenes] 영상 요청 완료: ${summary.generating}개 생성 중`);

    return NextResponse.json({
      success: true,
      timeline: {
        id: timeline.id,
        status: timeline.status,
        currentStep: timeline.currentStep,
        scenes: scenes.map(s => ({
          id: s.id,
          text: s.text,
          prompt: s.prompt,
          videoStatus: s.videoStatus,
          audioDurationMs: s.audioDurationMs,
          audioIncluded: s.audioIncluded || false,
        })),
        summary,
      },
    });

  } catch (error) {
    console.error('[ShortsScenes] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '씬 생성 중 오류가 발생했습니다.',
      },
      { status: 500 }
    );
  }
}

// GET: 씬 상태 확인 및 다운로드
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

    console.log(`[ShortsScenes] 씬 상태 확인: ${id}`);

    // SceneManager로 상태 확인 및 다운로드
    const sceneManager = createSceneManager({
      jobId: id,
      topic: timeline.topic,
      category: timeline.category || undefined,
      videoProvider: timeline.options.videoAI,
      videoGenerationMode: timeline.options.videoGenerationMode,
    });

    const scenes = await sceneManager.checkAndDownloadVideos(timeline.scenes);
    const summary = sceneManager.getScenesSummary(scenes);

    // 모든 씬 완료 확인
    const allCompleted = summary.generating === 0 && summary.pending === 0;
    
    if (allCompleted && summary.completed > 0) {
      timeline.status = 'scenes_completed';
      timeline.currentStep = 'video';
    }

    timeline.scenes = scenes;
    timeline.updatedAt = new Date().toISOString();
    await saveTimeline(timeline);

    console.log(`[ShortsScenes] 상태: ${summary.completed}/${summary.total} 완료`);

    return NextResponse.json({
      success: true,
      timeline: {
        id: timeline.id,
        status: timeline.status,
        currentStep: timeline.currentStep,
        scenes: scenes.map(s => ({
          id: s.id,
          text: s.text,
          prompt: s.prompt,
          videoStatus: s.videoStatus,
          videoPath: s.videoPath,
          videoDurationMs: s.videoDurationMs,
          audioDurationMs: s.audioDurationMs,
          audioIncluded: s.audioIncluded || false,
          errorMessage: s.errorMessage,
        })),
        summary,
        allCompleted,
      },
    });

  } catch (error) {
    console.error('[ShortsScenes] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '씬 상태 확인 중 오류가 발생했습니다.',
      },
      { status: 500 }
    );
  }
}

