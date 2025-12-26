import { NextResponse } from "next/server";
import { updateJobStatus, getJob } from "@/lib/jobs";
import { generateVideoPrompts } from "@/lib/openrouter";
import { requestVeoVideo } from "@/lib/veo";

interface AudioSegment {
  index: number;
  startTime: number;
  endTime: number;
  duration: number;
  text: string;
}

interface ClipInfo {
  index: number;
  segmentIndex: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  videoUrl?: string;
  prompt?: string;
  jobId?: string;
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

    console.log(`[GenerateClips] 클립 생성 시작: ${jobId} (${segments.length}개 세그먼트)`);

    const job = await getJob(jobId);
    if (!job) {
      return NextResponse.json(
        { success: false, error: "작업을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // 각 세그먼트에 대해 비디오 프롬프트 생성 및 Veo 요청
    const clips: ClipInfo[] = [];
    let previousPrompt = "";

    for (let i = 0; i < segments.length; i++) {
      const segment: AudioSegment = segments[i];
      
      console.log(`[GenerateClips] 클립 ${i + 1}/${segments.length} 프롬프트 생성 중...`);

      // AI로 비디오 프롬프트 생성
      let prompt = "";
      try {
        const prompts = await generateVideoPrompts({
          topic: job.topic,
          category: job.category ?? undefined,
          scriptSections: [segment.text],
          clipCount: segments.length,
          sceneIndex: i,
          totalScenes: segments.length,
          previousPrompt,
        });
        prompt = prompts[0] || "";
        previousPrompt = prompt;
      } catch (e) {
        console.error(`[GenerateClips] 프롬프트 생성 실패:`, e);
        prompt = `Cinematic vertical 9:16 video about: ${segment.text}. Smooth camera movements, warm lighting, engaging visuals.`;
      }

      // Veo로 비디오 생성 요청 (비동기)
      console.log(`[GenerateClips] 클립 ${i + 1} Veo 요청 중...`);
      
      let veoJobId = "";
      try {
        // Veo duration은 4~8초 범위로 제한
        const rawDuration = Math.ceil(segment.duration);
        const clipDuration = Math.max(4, Math.min(rawDuration, 8));
        
        console.log(`[GenerateClips] 클립 ${i + 1} duration: ${segment.duration.toFixed(1)}초 → ${clipDuration}초`);
        
        const result = await requestVeoVideo({
          prompt,
          model: "veo-3.1", // veo-3.1 사용 (안정적)
          duration: clipDuration,
          aspectRatio: "9:16",
        });
        veoJobId = result.jobId;
      } catch (e) {
        console.error(`[GenerateClips] Veo 요청 실패:`, e);
      }

      clips.push({
        index: i,
        segmentIndex: segment.index,
        status: veoJobId ? 'processing' : 'failed',
        prompt,
        jobId: veoJobId,
      });
    }

    // 작업 상태 업데이트
    await updateJobStatus(jobId, {
      clips: clips.map(c => ({
        index: c.index,
        scriptSection: segments[c.index]?.text || "",
        prompt: c.prompt || "",
        duration: Math.min(Math.ceil(segments[c.index]?.duration || 8), 8),
        status: c.status,
        jobId: c.jobId,
      })),
      clipProgress: `0/${clips.length}`,
    });

    console.log(`[GenerateClips] ${clips.length}개 클립 요청 완료`);

    return NextResponse.json({
      success: true,
      clips,
      message: `${clips.length}개 클립 생성이 시작되었습니다.`,
    });
  } catch (error) {
    console.error("[GenerateClips API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "클립 생성 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}

