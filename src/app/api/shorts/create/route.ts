/**
 * 쇼츠 생성 API - 씬 단위 파이프라인
 * 
 * POST /api/shorts/create
 * 
 * 새로운 쇼츠 생성 작업을 시작합니다.
 */

import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getScriptManager } from '@/script/ScriptManager';
import type { CreateTimelineRequest, Timeline, DEFAULT_TIMELINE_OPTIONS } from '@/core/types';
import fs from 'fs/promises';
import path from 'path';

// 작업 저장소
const JOBS_DIR = path.join(process.cwd(), 'data', 'shorts');

async function saveTimeline(timeline: Timeline): Promise<void> {
  await fs.mkdir(JOBS_DIR, { recursive: true });
  const filePath = path.join(JOBS_DIR, `${timeline.id}.json`);
  await fs.writeFile(filePath, JSON.stringify(timeline, null, 2));
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as CreateTimelineRequest;
    const { topic, category, targetDuration, options } = body;

    if (!topic) {
      return NextResponse.json(
        { success: false, error: '주제를 입력해주세요.' },
        { status: 400 }
      );
    }

    // 새 타임라인 ID 생성
    const timelineId = uuidv4();
    console.log(`[ShortsCreate] 새 작업 시작: ${timelineId}`);
    console.log(`  주제: ${topic}`);
    console.log(`  목표 길이: ${targetDuration}초`);

    // 타임라인 옵션 설정
    const videoAI = options?.videoAI || 'veo';
    
    const timelineOptions = {
      scriptAI: options?.scriptAI || 'claude',
      videoAI,
      // Veo 3: 영상 생성 시 음성 자체 생성 / Higgsfield: TTS로 음성 생성 후 합성
      videoGenerationMode: videoAI === 'veo' 
        ? 'text-to-video-with-audio' as const
        : 'video-then-audio' as const,
      resolution: { width: 1080, height: 1920 },
      aspectRatio: '9:16' as const,
      fps: 30,
      transitionPreset: options?.transitionPreset || 'smash_cut',
      transitionDurationMs: options?.transitionDurationMs || 200,
      enableSubtitles: options?.enableSubtitles ?? true,
      enableBGM: options?.enableBGM ?? false,
      bgmVolume: options?.bgmVolume ?? 0.3,
      enableDucking: options?.enableDucking ?? true,
    };

    // Step 1: 스크립트 생성
    console.log(`[ShortsCreate] Step 1: 스크립트 생성 시작`);
    const scriptManager = getScriptManager(timelineOptions.scriptAI as any);
    
    const scriptResult = await scriptManager.generateScript({
      topic,
      category,
      targetDurationSec: targetDuration,
    });

    // 씬 배열 생성
    const scenes = scriptManager.createScenesFromSentences(scriptResult.sentences);

    // 타임라인 객체 생성
    const timeline: Timeline = {
      id: timelineId,
      topic,
      category,
      totalDurationMs: scriptResult.estimatedDurationMs,
      targetDurationMs: targetDuration * 1000,
      scenes,
      status: 'script_completed',
      currentStep: 'audio',
      options: timelineOptions,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 저장
    await saveTimeline(timeline);

    console.log(`[ShortsCreate] 스크립트 생성 완료: ${scenes.length}개 씬`);

    return NextResponse.json({
      success: true,
      timeline: {
        id: timeline.id,
        topic: timeline.topic,
        status: timeline.status,
        currentStep: timeline.currentStep,
        sceneCount: scenes.length,
        estimatedDurationMs: timeline.totalDurationMs,
        script: scriptResult.fullScript,
        scenes: scenes.map(s => ({
          id: s.id,
          text: s.text,
          estimatedDurationMs: s.audioDurationMs,
        })),
      },
    });

  } catch (error) {
    console.error('[ShortsCreate] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '쇼츠 생성 중 오류가 발생했습니다.',
      },
      { status: 500 }
    );
  }
}

