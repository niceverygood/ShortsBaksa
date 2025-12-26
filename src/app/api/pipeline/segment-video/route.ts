import { NextResponse } from "next/server";
import { updateJobStatus, getJob } from "@/lib/jobs";
import { generateVideoPrompts } from "@/lib/openrouter";
import { requestVeoVideo } from "@/lib/veo";
import { requestHiggsfieldVideo } from "@/lib/higgsfield";

interface SegmentForVideo {
  index: number;
  text: string;
  audioUrl: string;
  actualDuration: number;
}

interface VideoClip {
  index: number;
  text: string;
  audioUrl: string;
  duration: number;
  prompt?: string;
  jobId?: string;
  videoUrl?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

type VideoProvider = 'veo' | 'higgsfield';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { jobId, segments, videoProvider = 'veo' } = body as {
      jobId: string;
      segments: SegmentForVideo[];
      videoProvider?: VideoProvider;
    };

    if (!jobId || !segments || segments.length === 0) {
      return NextResponse.json(
        { success: false, error: "jobId와 segments가 필요합니다." },
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

    console.log(`[SegmentVideo] ${segments.length}개 세그먼트 영상 생성 시작 (Provider: ${videoProvider})`);

    const clips: VideoClip[] = [];
    let previousPrompt = "";

    // 각 세그먼트별로 프롬프트 생성 및 영상 요청
    for (const seg of segments) {
      console.log(`[SegmentVideo] 클립 ${seg.index + 1}/${segments.length} 처리 중...`);

      // 1. AI로 비디오 프롬프트 생성
      let prompt = "";
      try {
        console.log(`  [${seg.index}] 프롬프트 생성 중...`);
        const prompts = await generateVideoPrompts({
          topic: job.topic,
          category: job.category ?? undefined,
          scriptSections: [seg.text],
          clipCount: segments.length,
          sceneIndex: seg.index,
          totalScenes: segments.length,
          previousPrompt,
        });
        prompt = prompts[0] || "";
        previousPrompt = prompt;
      } catch (e) {
        console.error(`  [${seg.index}] 프롬프트 생성 실패:`, e);
        prompt = `Cinematic vertical 9:16 video. Warm lighting, smooth camera movement. Content: ${seg.text.substring(0, 100)}`;
      }

      // 2. 선택된 Provider로 영상 생성 요청
      let videoJobId = "";
      try {
        if (videoProvider === 'veo') {
          // Veo: duration 4~8초
          const rawDuration = Math.round(seg.actualDuration);
          const clipDuration = Math.max(4, Math.min(rawDuration, 8));
          console.log(`  [${seg.index}] Veo 요청 중 (${seg.actualDuration.toFixed(1)}초 → ${clipDuration}초)...`);

          const result = await requestVeoVideo({
            prompt,
            model: "veo-3.1",
            duration: clipDuration,
            aspectRatio: "9:16",
          });
          videoJobId = result.jobId;
        } else if (videoProvider === 'higgsfield') {
          // Higgsfield (Seedance): duration 5~10초
          const rawDuration = Math.round(seg.actualDuration);
          const clipDuration = Math.max(5, Math.min(rawDuration, 10));
          console.log(`  [${seg.index}] Higgsfield 요청 중 (${seg.actualDuration.toFixed(1)}초 → ${clipDuration}초)...`);

          const result = await requestHiggsfieldVideo({
            prompt,
            model: "seedance-1.5", // 가장 안정적인 모델
            duration: clipDuration,
            aspectRatio: "9:16",
          });
          videoJobId = result.jobId;
        }

        if (videoJobId) {
          console.log(`  [${seg.index}] ✅ ${videoProvider} 요청 성공: ${videoJobId}`);
        }
      } catch (e) {
        console.error(`  [${seg.index}] ❌ ${videoProvider} 요청 실패:`, e);
      }

      clips.push({
        index: seg.index,
        text: seg.text,
        audioUrl: seg.audioUrl,
        duration: seg.actualDuration,
        prompt,
        jobId: videoJobId,
        status: videoJobId ? 'processing' : 'failed',
      });
    }

    // 작업 상태 업데이트
    await updateJobStatus(jobId, {
      status: "render",
      videoProvider,
      clips: clips.map(c => ({
        index: c.index,
        scriptSection: c.text,
        prompt: c.prompt || "",
        duration: c.duration,
        status: c.status,
        jobId: c.jobId,
        audioUrl: c.audioUrl,
      })),
      clipProgress: `0/${clips.length}`,
    });

    const processingCount = clips.filter(c => c.status === 'processing').length;
    console.log(`[SegmentVideo] ${processingCount}/${clips.length}개 영상 생성 요청 완료 (${videoProvider})`);

    return NextResponse.json({
      success: true,
      clips,
      processingCount,
      videoProvider,
      message: `${processingCount}개 영상 생성이 시작되었습니다. (${videoProvider})`,
    });
  } catch (error) {
    console.error("[SegmentVideo API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "영상 생성 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
