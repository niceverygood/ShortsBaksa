import { NextResponse } from "next/server";
import { getJob, updateJobStatus } from "@/lib/jobs";
import { mergeVideoAndAudio, mergeVideos } from "@/lib/ffmpeg";
import path from "path";
import fs from "fs/promises";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { jobId } = body;

    if (!jobId) {
      return NextResponse.json(
        { success: false, error: "jobId가 필요합니다." },
        { status: 400 }
      );
    }

    const job = await getJob(jobId);
    if (!job) {
      return NextResponse.json(
        { success: false, error: "작업을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    if (!job.clips || job.clips.length === 0) {
      return NextResponse.json(
        { success: false, error: "합칠 클립이 없습니다." },
        { status: 400 }
      );
    }

    // 완료된 클립들 확인
    const completedClips = job.clips
      .filter(c => c.status === "completed" && c.videoUrl)
      .sort((a, b) => a.index - b.index);
    
    if (completedClips.length === 0) {
      return NextResponse.json(
        { success: false, error: "완료된 클립이 없습니다." },
        { status: 400 }
      );
    }

    console.log(`[Merge] ${completedClips.length}개 클립 합치기 시작`);

    // 출력 경로
    const videosDir = path.join(process.cwd(), "public", "videos");
    const tempDir = path.join(process.cwd(), "public", "videos", "temp");
    await fs.mkdir(videosDir, { recursive: true });
    await fs.mkdir(tempDir, { recursive: true });

    // Step 1: 각 클립에 해당 오디오 합치기
    const clipsWithAudio: string[] = [];
    
    for (const clip of completedClips) {
      const videoPath = path.join(process.cwd(), "public", clip.videoUrl!);
      
      // 클립에 audioUrl이 있는지 확인
      if (clip.audioUrl) {
        const audioPath = path.join(process.cwd(), "public", clip.audioUrl);
        const outputPath = path.join(tempDir, `clip-with-audio-${clip.index}.mp4`);
        
        try {
          // 파일 존재 확인
          await fs.access(videoPath);
          await fs.access(audioPath);
          
          console.log(`[Merge] 클립 ${clip.index}: 영상 + 음성 합치기`);
          await mergeVideoAndAudio(videoPath, audioPath, outputPath);
          clipsWithAudio.push(outputPath);
        } catch (e) {
          console.warn(`[Merge] 클립 ${clip.index} 오디오 합치기 실패, 영상만 사용:`, e);
          clipsWithAudio.push(videoPath);
        }
      } else {
        // 오디오가 없으면 영상만 사용
        console.log(`[Merge] 클립 ${clip.index}: 오디오 없음, 영상만 사용`);
        clipsWithAudio.push(videoPath);
      }
    }

    // Step 2: 모든 클립 합치기
    const outputFileName = `final-${jobId}-${Date.now()}.mp4`;
    const outputPath = path.join(videosDir, outputFileName);

    console.log(`[Merge] ${clipsWithAudio.length}개 클립을 하나로 합치기`);
    await mergeVideos(clipsWithAudio, outputPath);

    // 임시 파일 정리
    try {
      const tempFiles = await fs.readdir(tempDir);
      for (const file of tempFiles) {
        if (file.startsWith(`clip-with-audio-`)) {
          await fs.unlink(path.join(tempDir, file));
        }
      }
    } catch (e) {
      console.warn("[Merge] 임시 파일 정리 실패:", e);
    }

    const videoUrl = `/videos/${outputFileName}`;

    // 작업 상태 업데이트
    await updateJobStatus(jobId, {
      status: "completed",
      videoUrl,
    });

    console.log(`[Merge] 합치기 완료: ${videoUrl}`);

    return NextResponse.json({
      success: true,
      videoUrl,
      message: `${completedClips.length}개 클립이 음성과 함께 성공적으로 합쳐졌습니다.`,
    });
  } catch (error) {
    console.error("[Merge API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "클립 합치기 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
