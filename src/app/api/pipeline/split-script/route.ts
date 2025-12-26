import { NextResponse } from "next/server";
import { updateJobStatus } from "@/lib/jobs";

interface ScriptSegment {
  index: number;
  text: string;
  estimatedDuration: number; // 예상 음성 길이 (초)
}

// 한국어 기준 초당 약 4~5글자 (TTS 속도 고려)
const CHARS_PER_SECOND = 4.5;
const MIN_SEGMENT_DURATION = 5; // 최소 5초
const MAX_SEGMENT_DURATION = 8; // 최대 8초

/**
 * 스크립트를 5~8초 단위로 텍스트 분할
 */
function splitScriptToSegments(script: string): ScriptSegment[] {
  // 문장 단위로 분할
  const sentences = script
    .split(/(?<=[.!?])\s*/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  if (sentences.length === 0) {
    return [];
  }

  const segments: ScriptSegment[] = [];
  let currentText = "";
  let currentChars = 0;
  let segmentIndex = 0;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const sentenceChars = sentence.length;
    const sentenceDuration = sentenceChars / CHARS_PER_SECOND;
    
    // 현재 세그먼트에 이 문장을 추가했을 때의 예상 시간
    const projectedDuration = (currentChars + sentenceChars) / CHARS_PER_SECOND;
    
    // 8초를 초과할 것 같으면 현재까지의 내용을 세그먼트로 저장
    if (currentChars > 0 && projectedDuration > MAX_SEGMENT_DURATION) {
      const estimatedDuration = currentChars / CHARS_PER_SECOND;
      
      segments.push({
        index: segmentIndex,
        text: currentText.trim(),
        estimatedDuration: Math.round(estimatedDuration * 10) / 10,
      });
      
      segmentIndex++;
      currentText = "";
      currentChars = 0;
    }
    
    // 문장 추가
    currentText += (currentText ? " " : "") + sentence;
    currentChars += sentenceChars;
    
    // 마지막 문장이거나 5초 이상이면 세그먼트 완성
    const currentDuration = currentChars / CHARS_PER_SECOND;
    const isLastSentence = i === sentences.length - 1;
    
    if (isLastSentence || currentDuration >= MIN_SEGMENT_DURATION) {
      // 마지막이 아니고 8초 미만이면 더 누적 가능
      if (!isLastSentence && currentDuration < MAX_SEGMENT_DURATION) {
        continue;
      }
      
      segments.push({
        index: segmentIndex,
        text: currentText.trim(),
        estimatedDuration: Math.round(currentDuration * 10) / 10,
      });
      
      segmentIndex++;
      currentText = "";
      currentChars = 0;
    }
  }

  // 마지막 세그먼트가 너무 짧으면 (3초 미만) 이전과 합치기
  if (segments.length > 1) {
    const lastSeg = segments[segments.length - 1];
    const prevSeg = segments[segments.length - 2];
    const combinedDuration = lastSeg.estimatedDuration + prevSeg.estimatedDuration;
    
    if (lastSeg.estimatedDuration < 3 && combinedDuration <= MAX_SEGMENT_DURATION) {
      prevSeg.text += " " + lastSeg.text;
      prevSeg.estimatedDuration = Math.round(combinedDuration * 10) / 10;
      segments.pop();
    }
  }

  return segments;
}

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

    console.log(`[SplitScript] 스크립트 분할 시작: ${jobId}`);

    // 스크립트를 세그먼트로 분할
    const segments = splitScriptToSegments(script);

    console.log(`[SplitScript] ${segments.length}개 세그먼트로 분할 완료`);
    segments.forEach((seg, i) => {
      console.log(`  [${i}] 예상 ${seg.estimatedDuration}초: ${seg.text.substring(0, 40)}...`);
    });

    // 총 예상 시간
    const totalEstimatedDuration = segments.reduce((sum, seg) => sum + seg.estimatedDuration, 0);

    return NextResponse.json({
      success: true,
      segments,
      totalEstimatedDuration: Math.round(totalEstimatedDuration * 10) / 10,
    });
  } catch (error) {
    console.error("[SplitScript API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "스크립트 분할 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}

