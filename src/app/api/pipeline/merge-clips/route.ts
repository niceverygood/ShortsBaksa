import { NextResponse } from "next/server";
import { getJob, updateJobStatus } from "@/lib/jobs";
import { mergeClipsIntoVideo } from "@/lib/multi-clip";
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

    // 작업 상태 확인
    const job = await getJob(jobId);
    if (!job) {
      return NextResponse.json(
        { success: false, error: "작업을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // 클립이 있는지 확인
    if (!job.clips || job.clips.length === 0) {
      return NextResponse.json(
        { success: false, error: "합칠 클립이 없습니다." },
        { status: 400 }
      );
    }

    // 완료된 클립들 필터링
    const completedClips = job.clips.filter(
      (clip) => clip.status === "completed" && clip.videoUrl
    );

    if (completedClips.length === 0) {
      return NextResponse.json(
        { success: false, error: "완료된 클립이 없습니다." },
        { status: 400 }
      );
    }

    console.log(`[Merge] 클립 합치기 시작: ${completedClips.length}개 클립`);

    // 오디오 경로 확인
    let audioPath: string | undefined;
    if (job.audioUrl) {
      // audioUrl이 상대 경로인 경우 로컬 경로로 변환
      const audioUrlPath = job.audioUrl.startsWith("/")
        ? job.audioUrl
        : new URL(job.audioUrl).pathname;
      audioPath = path.join(process.cwd(), "public", audioUrlPath);
    }

    // 클립 합치기 실행
    const outputFileName = `merged_${jobId}_${Date.now()}.mp4`;
    const outputPath = path.join(process.cwd(), "public", "videos", outputFileName);
    
    // videos 폴더 생성 확인
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    try {
      // ClipInfo[] 형태로 전달
      await mergeClipsIntoVideo(job.clips, outputPath, audioPath, job.audioDuration);
    } catch (mergeError) {
      console.error("[Merge] 클립 합치기 실패:", mergeError);
      return NextResponse.json(
        {
          success: false,
          error: `클립 합치기 실패: ${mergeError instanceof Error ? mergeError.message : "알 수 없는 오류"}`,
        },
        { status: 500 }
      );
    }

    const videoUrl = `/videos/${outputFileName}`;
    
    // 클립 URL 목록 추출 (저장용)
    const clipUrls = completedClips
      .sort((a, b) => a.index - b.index)
      .map((clip) => clip.videoUrl as string);

    // 작업 상태 업데이트
    const updatedJob = await updateJobStatus(jobId, {
      videoUrl,
      clipUrls,
      status: job.autoUpload ? "upload" : "completed",
    });

    console.log(`[Merge] 클립 합치기 완료: ${videoUrl}`);

    return NextResponse.json({
      success: true,
      job: updatedJob,
      videoUrl,
      message: `${completedClips.length}개 클립이 성공적으로 합쳐졌습니다.`,
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

