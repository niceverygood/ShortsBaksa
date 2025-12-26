import { NextResponse } from "next/server";
import { getJob, updateJobStatus } from "@/lib/jobs";
import { getVeoVideoResult } from "@/lib/veo";
import { getHiggsfieldVideoResult } from "@/lib/higgsfield";
import { downloadFile } from "@/lib/storage";
import path from "path";
import fs from "fs/promises";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("jobId");

    if (!jobId) {
      return NextResponse.json(
        { success: false, error: "jobId가 필요합니다." },
        { status: 400 }
      );
    }

    const job = await getJob(jobId);
    if (!job || !job.clips) {
      return NextResponse.json(
        { success: false, error: "작업을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const videoProvider = job.videoProvider || 'veo';
    console.log(`[ClipStatus] Provider: ${videoProvider}, Job: ${jobId}`);

    // videos 폴더 확인
    const videosDir = path.join(process.cwd(), "public", "videos");
    await fs.mkdir(videosDir, { recursive: true });

    // 각 클립 상태 확인
    const updatedClips = await Promise.all(
      job.clips.map(async (clip) => {
        // 이미 완료되었거나 실패한 클립은 건너뛰기
        if (clip.status === "completed" || clip.status === "failed" || !clip.jobId) {
          return clip;
        }

        try {
          console.log(`[ClipStatus] 클립 ${clip.index} 상태 확인: ${clip.jobId}`);
          
          // Provider에 따라 다른 API 호출
          let result;
          if (videoProvider === 'higgsfield') {
            result = await getHiggsfieldVideoResult(clip.jobId);
          } else {
            result = await getVeoVideoResult(clip.jobId);
          }
          
          if (result.status === "completed" && result.videoUrl) {
            // 비디오 다운로드
            console.log(`[ClipStatus] 클립 ${clip.index} 다운로드 중... (${result.videoUrl})`);
            const videoBuffer = await downloadFile(result.videoUrl);
            
            const videoFileName = `clip-${jobId}-${clip.index}-${Date.now()}.mp4`;
            const videoPath = path.join(videosDir, videoFileName);
            await fs.writeFile(videoPath, videoBuffer);
            
            console.log(`[ClipStatus] 클립 ${clip.index} 완료: /videos/${videoFileName}`);
            
            return {
              ...clip,
              status: "completed" as const,
              videoUrl: `/videos/${videoFileName}`,
            };
          } else if (result.status === "failed") {
            console.log(`[ClipStatus] 클립 ${clip.index} 실패: ${result.errorMessage}`);
            return {
              ...clip,
              status: "failed" as const,
            };
          }
          
          // 아직 처리 중
          console.log(`[ClipStatus] 클립 ${clip.index} 처리 중...`);
          return clip;
        } catch (e) {
          console.error(`[ClipStatus] 클립 ${clip.index} 상태 확인 실패:`, e);
          return clip;
        }
      })
    );

    // 진행 상황 계산
    const completedCount = updatedClips.filter(c => c.status === "completed").length;
    const failedCount = updatedClips.filter(c => c.status === "failed").length;
    const totalCount = updatedClips.length;

    console.log(`[ClipStatus] 진행: ${completedCount}/${totalCount} 완료, ${failedCount} 실패`);

    // 작업 상태 업데이트
    await updateJobStatus(jobId, {
      clips: updatedClips,
      clipProgress: `${completedCount}/${totalCount}`,
    });

    return NextResponse.json({
      success: true,
      clips: updatedClips.map(c => ({
        index: c.index,
        segmentIndex: c.index,
        status: c.status,
        videoUrl: c.videoUrl,
        prompt: c.prompt,
        text: c.scriptSection,
        audioUrl: c.audioUrl,
      })),
      progress: `${completedCount}/${totalCount}`,
      completedCount,
      failedCount,
    });
  } catch (error) {
    console.error("[ClipStatus API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "클립 상태 확인 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
