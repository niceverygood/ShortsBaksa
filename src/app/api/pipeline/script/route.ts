import { NextResponse } from "next/server";
import { generateScript } from "@/lib/openrouter";
import { createJob, updateJobStatus } from "@/lib/jobs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { topic, category, duration, aiModel } = body;

    if (!topic) {
      return NextResponse.json(
        { success: false, error: "주제를 입력해주세요." },
        { status: 400 }
      );
    }

    console.log(`[Script] 스크립트 생성 시작: ${topic} (${duration}초, AI: ${aiModel || 'claude'})`);

    // AI로 스크립트 생성
    const script = await generateScript({
      topic,
      category,
      aiModel: aiModel || 'claude',
    });

    if (!script) {
      throw new Error("스크립트 생성에 실패했습니다.");
    }

    // 작업 생성
    const job = await createJob({
      topic,
      category,
      autoUpload: false,
    });

    // 스크립트 업데이트
    await updateJobStatus(job.id, {
      script,
    });

    console.log(`[Script] 스크립트 생성 완료: ${script.length}자`);

    return NextResponse.json({
      success: true,
      script,
      jobId: job.id,
    });
  } catch (error) {
    console.error("[Script API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "스크립트 생성 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}

