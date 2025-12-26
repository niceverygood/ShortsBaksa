import { NextResponse } from "next/server";
import { generateTTS } from "@/lib/elevenlabs";
import { updateJobStatus } from "@/lib/jobs";
import { getAudioDuration } from "@/lib/ffmpeg";
import path from "path";
import fs from "fs/promises";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { jobId, script } = body;

    if (!jobId || !script) {
      return NextResponse.json(
        { success: false, error: "jobId와 script가 필요합니다." },
        { status: 400 }
      );
    }

    console.log(`[Audio] 음성 생성 시작: ${jobId}`);

    // TTS로 음성 생성
    const audioResult = await generateTTS({ script });

    if (!audioResult || !audioResult.audioBuffer) {
      throw new Error("음성 생성에 실패했습니다.");
    }

    // 오디오 파일 저장
    const audioDir = path.join(process.cwd(), "public", "audio");
    await fs.mkdir(audioDir, { recursive: true });
    
    const audioFilePath = path.join(audioDir, audioResult.fileName);
    await fs.writeFile(audioFilePath, audioResult.audioBuffer);

    // 음성 URL 생성 (상대 경로)
    const audioUrl = `/audio/${audioResult.fileName}`;
    
    // 음성 길이 확인
    let duration = 0;
    try {
      duration = await getAudioDuration(audioFilePath);
    } catch (e) {
      console.warn("[Audio] 음성 길이 확인 실패:", e);
    }

    // 작업 상태 업데이트
    await updateJobStatus(jobId, {
      status: "audio",
      audioUrl,
      audioDuration: duration,
    });

    console.log(`[Audio] 음성 생성 완료: ${audioUrl} (${duration}초)`);

    return NextResponse.json({
      success: true,
      audioUrl,
      duration,
    });
  } catch (error) {
    console.error("[Audio API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "음성 생성 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}

