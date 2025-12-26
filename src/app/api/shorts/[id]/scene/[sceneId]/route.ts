/**
 * 개별 씬 수정 API
 * 
 * PUT /api/shorts/[id]/scene/[sceneId]
 * 
 * 특정 씬의 텍스트나 프롬프트를 수정합니다.
 */

import { NextResponse } from 'next/server';
import { createAudioManager } from '@/audio/AudioManager';
import { createSceneManager } from '@/scenes/SceneManager';
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

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; sceneId: string }> }
) {
  try {
    const { id, sceneId } = await params;
    const body = await request.json();
    const { text, prompt, regenerateAudio, regenerateVideo } = body;

    const timeline = await loadTimeline(id);
    if (!timeline) {
      return NextResponse.json(
        { success: false, error: '작업을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const sceneIndex = timeline.scenes.findIndex(s => s.id === parseInt(sceneId));
    if (sceneIndex === -1) {
      return NextResponse.json(
        { success: false, error: '씬을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const scene = timeline.scenes[sceneIndex];
    console.log(`[SceneEdit] 씬 ${sceneId} 수정: ${id}`);

    // 텍스트 수정
    if (text !== undefined) {
      scene.text = text;
      // 예상 길이 재계산
      const charCount = text.replace(/\s/g, '').length;
      scene.audioDurationMs = Math.round((charCount / 4.5) * 1000);
    }

    // 프롬프트 수정
    if (prompt !== undefined) {
      scene.prompt = prompt;
    }

    // 음성 재생성
    if (regenerateAudio && text) {
      console.log(`[SceneEdit] 씬 ${sceneId} 음성 재생성`);
      const audioManager = createAudioManager(id);
      const audioResult = await audioManager.generateAudio([scene]);
      
      if (audioResult.segments.length > 0) {
        const segment = audioResult.segments[0];
        scene.audioPath = segment.audioPath;
        scene.audioDurationMs = segment.durationMs;
      }
    }

    // 영상 재생성 요청
    if (regenerateVideo) {
      console.log(`[SceneEdit] 씬 ${sceneId} 영상 재생성 요청`);
      const sceneManager = createSceneManager({
        jobId: id,
        topic: timeline.topic,
        category: timeline.category || undefined,
        videoProvider: timeline.options.videoAI,
      });

      // 프롬프트가 없으면 새로 생성
      if (!scene.prompt) {
        const scenes = await sceneManager.generatePrompts([scene]);
        scene.prompt = scenes[0].prompt;
      }

      // 영상 요청
      const requestedScenes = await sceneManager.requestVideos([{ ...scene, videoStatus: 'pending' }]);
      scene.videoStatus = requestedScenes[0].videoStatus;
      scene.videoPath = requestedScenes[0].videoPath;
    }

    // 타임라인 업데이트
    timeline.scenes[sceneIndex] = scene;
    timeline.updatedAt = new Date().toISOString();
    await saveTimeline(timeline);

    console.log(`[SceneEdit] 씬 ${sceneId} 수정 완료`);

    return NextResponse.json({
      success: true,
      scene: {
        id: scene.id,
        text: scene.text,
        prompt: scene.prompt,
        audioPath: scene.audioPath,
        audioDurationMs: scene.audioDurationMs,
        videoPath: scene.videoPath,
        videoStatus: scene.videoStatus,
      },
    });

  } catch (error) {
    console.error('[SceneEdit] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '씬 수정 중 오류가 발생했습니다.',
      },
      { status: 500 }
    );
  }
}

