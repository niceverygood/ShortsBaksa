/**
 * 쇼츠 최종 내보내기 API
 * 
 * POST /api/shorts/[id]/export
 * 
 * 자막, BGM을 추가하고 최종 영상을 내보냅니다.
 */

import { NextResponse } from 'next/server';
import { createExporter } from '@/export/Exporter';
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
    const body = await request.json().catch(() => ({}));
    
    const timeline = await loadTimeline(id);
    if (!timeline) {
      return NextResponse.json(
        { success: false, error: '작업을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    if (!timeline.fullVideoPath || !timeline.fullAudioPath) {
      return NextResponse.json(
        { success: false, error: '먼저 타임라인 조립을 완료해주세요.' },
        { status: 400 }
      );
    }

    console.log(`[ShortsExport] 최종 내보내기 시작: ${id}`);

    // 옵션 업데이트 (BGM 등)
    if (body.enableBGM !== undefined) {
      timeline.options.enableBGM = body.enableBGM;
    }
    if (body.bgmPath) {
      timeline.options.bgmPath = body.bgmPath;
    }
    if (body.enableSubtitles !== undefined) {
      timeline.options.enableSubtitles = body.enableSubtitles;
    }

    // Exporter로 최종 내보내기
    const exporter = createExporter(id, timeline.options);
    
    const exportResult = await exporter.export(
      timeline.fullVideoPath,
      timeline.fullAudioPath,
      timeline.scenes
    );

    // 타임라인 업데이트
    timeline.fullVideoPath = exportResult.videoPath;
    timeline.timelineJsonPath = exportResult.timelineJsonPath;
    timeline.totalDurationMs = exportResult.totalDurationMs;
    timeline.status = 'completed';
    timeline.currentStep = 'export';
    timeline.updatedAt = new Date().toISOString();

    await saveTimeline(timeline);

    console.log(`[ShortsExport] 내보내기 완료: ${exportResult.videoPath}`);

    return NextResponse.json({
      success: true,
      result: {
        id: timeline.id,
        status: timeline.status,
        videoPath: exportResult.videoPath,
        timelineJsonPath: exportResult.timelineJsonPath,
        logPath: exportResult.logPath,
        totalDurationMs: exportResult.totalDurationMs,
        fileSizeMB: Math.round(exportResult.fileSize / 1024 / 1024 * 100) / 100,
      },
    });

  } catch (error) {
    console.error('[ShortsExport] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '내보내기 중 오류가 발생했습니다.',
      },
      { status: 500 }
    );
  }
}

