import { NextResponse } from "next/server";
import { generateTTS } from "@/lib/elevenlabs";
import { getAudioDuration } from "@/lib/ffmpeg";
import { updateJobStatus } from "@/lib/jobs";
import path from "path";
import fs from "fs/promises";

interface SegmentWithAudio {
  index: number;
  text: string;
  estimatedDuration: number;
  audioUrl?: string;
  actualDuration?: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { jobId, segments } = body;

    if (!jobId || !segments || segments.length === 0) {
      return NextResponse.json(
        { success: false, error: "jobId와 segments가 필요합니다." },
        { status: 400 }
      );
    }

    console.log(`[SegmentAudio] ${segments.length}개 세그먼트 음성 생성 시작: ${jobId}`);

    // 오디오 저장 폴더 생성
    const audioDir = path.join(process.cwd(), "public", "audio", "segments", jobId);
    await fs.mkdir(audioDir, { recursive: true });

    const updatedSegments: SegmentWithAudio[] = [];
    let totalActualDuration = 0;

    // 각 세그먼트별로 TTS 생성
    for (const seg of segments) {
      console.log(`[SegmentAudio] 세그먼트 ${seg.index + 1}/${segments.length} 음성 생성 중...`);
      
      try {
        // TTS 생성
        const audioResult = await generateTTS({ script: seg.text });
        
        if (!audioResult || !audioResult.audioBuffer) {
          throw new Error("음성 생성 실패");
        }

        // 파일 저장
        const audioFileName = `segment-${seg.index}.mp3`;
        const audioPath = path.join(audioDir, audioFileName);
        await fs.writeFile(audioPath, audioResult.audioBuffer);

        // 실제 오디오 길이 측정
        const actualDuration = await getAudioDuration(audioPath);
        totalActualDuration += actualDuration;

        updatedSegments.push({
          ...seg,
          audioUrl: `/audio/segments/${jobId}/${audioFileName}`,
          actualDuration: Math.round(actualDuration * 10) / 10,
          status: 'completed',
        });

        console.log(`  [${seg.index}] ✅ 완료 (예상: ${seg.estimatedDuration}초 → 실제: ${actualDuration.toFixed(1)}초)`);
      } catch (e) {
        console.error(`  [${seg.index}] ❌ 실패:`, e);
        updatedSegments.push({
          ...seg,
          status: 'failed',
        });
      }
    }

    // 작업 상태 업데이트
    await updateJobStatus(jobId, {
      status: "audio",
      audioDuration: totalActualDuration,
    });

    const completedCount = updatedSegments.filter(s => s.status === 'completed').length;
    console.log(`[SegmentAudio] 완료: ${completedCount}/${segments.length} 성공, 총 ${totalActualDuration.toFixed(1)}초`);

    return NextResponse.json({
      success: true,
      segments: updatedSegments,
      totalActualDuration: Math.round(totalActualDuration * 10) / 10,
      completedCount,
    });
  } catch (error) {
    console.error("[SegmentAudio API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "음성 생성 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}

