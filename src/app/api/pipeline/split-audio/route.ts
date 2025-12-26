import { NextResponse } from "next/server";
import { updateJobStatus } from "@/lib/jobs";
import { getAudioDuration, splitAudio } from "@/lib/ffmpeg";
import path from "path";
import fs from "fs/promises";

interface AudioSegment {
  index: number;
  startTime: number;
  endTime: number;
  duration: number;
  text: string;
  audioUrl?: string;
}

// 문장을 세그먼트로 분할 (무조건 9초 미만)
const MAX_SEGMENT_DURATION = 8.9; // 9초 미만 보장

function splitScriptToSegments(script: string, totalDuration: number, targetSegmentDuration: number = 7): AudioSegment[] {
  // 문장 단위로 분할
  const sentences = script
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  if (sentences.length === 0) {
    return [];
  }

  // 전체 글자 수 계산
  const totalChars = sentences.reduce((sum, s) => sum + s.length, 0);
  const charsPerSecond = totalChars / totalDuration;
  
  // 세그먼트 그룹화
  const segments: AudioSegment[] = [];
  let currentText = "";
  let currentStartTime = 0;
  let currentChars = 0;
  let segmentIndex = 0;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const sentenceChars = sentence.length;
    const sentenceDuration = sentenceChars / charsPerSecond;
    
    // 현재 세그먼트에 이 문장을 추가했을 때의 예상 시간
    const projectedDuration = (currentChars + sentenceChars) / charsPerSecond;
    
    // 9초를 초과할 것 같으면 현재까지의 내용을 세그먼트로 저장하고 새로 시작
    if (currentChars > 0 && projectedDuration > MAX_SEGMENT_DURATION) {
      const segmentDuration = currentChars / charsPerSecond;
      const endTime = Math.min(currentStartTime + segmentDuration, totalDuration);
      
      segments.push({
        index: segmentIndex,
        startTime: currentStartTime,
        endTime,
        duration: endTime - currentStartTime,
        text: currentText.trim(),
      });
      
      segmentIndex++;
      currentStartTime = endTime;
      currentText = "";
      currentChars = 0;
    }
    
    // 문장 추가
    currentText += (currentText ? " " : "") + sentence;
    currentChars += sentenceChars;
    
    // 목표 길이에 도달했거나 마지막 문장인 경우
    const currentDuration = currentChars / charsPerSecond;
    const isLastSentence = i === sentences.length - 1;
    
    if (currentDuration >= targetSegmentDuration || isLastSentence) {
      // 마지막이 아니면서 9초 미만이면 계속 누적할 수 있음
      if (!isLastSentence && currentDuration < MAX_SEGMENT_DURATION) {
        continue;
      }
      
      const endTime = Math.min(currentStartTime + currentDuration, totalDuration);
      
      segments.push({
        index: segmentIndex,
        startTime: currentStartTime,
        endTime,
        duration: endTime - currentStartTime,
        text: currentText.trim(),
      });
      
      segmentIndex++;
      currentStartTime = endTime;
      currentText = "";
      currentChars = 0;
    }
  }

  // 마지막 세그먼트가 너무 짧으면 (3초 미만) 이전 세그먼트와 합치기 (단, 합친 결과가 9초 미만일 때만)
  if (segments.length > 1) {
    const lastSegment = segments[segments.length - 1];
    const prevSegment = segments[segments.length - 2];
    const combinedDuration = prevSegment.duration + lastSegment.duration;
    
    if (lastSegment.duration < 3 && combinedDuration < MAX_SEGMENT_DURATION) {
      prevSegment.endTime = lastSegment.endTime;
      prevSegment.duration = combinedDuration;
      prevSegment.text += " " + lastSegment.text;
      segments.pop();
    }
  }

  return segments;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { jobId, audioUrl, script, segmentDuration = 8 } = body;

    if (!jobId || !audioUrl || !script) {
      return NextResponse.json(
        { success: false, error: "jobId, audioUrl, script가 필요합니다." },
        { status: 400 }
      );
    }

    console.log(`[SplitAudio] 음성 분할 시작: ${jobId}`);

    // 음성 파일 경로
    const audioPath = path.join(process.cwd(), "public", audioUrl);
    
    // 음성 길이 확인
    let totalDuration = 0;
    try {
      totalDuration = await getAudioDuration(audioPath);
    } catch (e) {
      console.warn("[SplitAudio] 음성 길이 확인 실패:", e);
      // 기본값으로 글자 수 기반 추정
      totalDuration = script.length / 10; // 대략 10자/초
    }

    // 스크립트를 세그먼트로 분할
    const segments = splitScriptToSegments(script, totalDuration, segmentDuration);

    console.log(`[SplitAudio] ${segments.length}개 세그먼트로 분할 완료`);

    // 분할된 오디오 저장 폴더 생성
    const segmentsDir = path.join(process.cwd(), "public", "audio", "segments", jobId);
    await fs.mkdir(segmentsDir, { recursive: true });

    // 각 세그먼트별로 오디오 파일 분할 및 실제 길이 측정
    for (const seg of segments) {
      const segmentFileName = `segment-${seg.index}.mp3`;
      const segmentPath = path.join(segmentsDir, segmentFileName);
      
      try {
        await splitAudio(audioPath, seg.startTime, seg.duration, segmentPath);
        seg.audioUrl = `/audio/segments/${jobId}/${segmentFileName}`;
        
        // 실제 분할된 오디오 파일 길이 측정
        const actualDuration = await getAudioDuration(segmentPath);
        seg.duration = actualDuration;
        seg.endTime = seg.startTime + actualDuration;
        
        console.log(`  [${seg.index}] ${seg.startTime.toFixed(1)}s ~ ${seg.endTime.toFixed(1)}s (실제: ${actualDuration.toFixed(1)}초) ✅`);
      } catch (e) {
        console.error(`  [${seg.index}] 오디오 분할 실패:`, e);
      }
    }
    
    // 세그먼트 시작/종료 시간 재계산 (연속되도록)
    let currentTime = 0;
    for (const seg of segments) {
      seg.startTime = currentTime;
      seg.endTime = currentTime + seg.duration;
      currentTime = seg.endTime;
    }

    // 작업 상태 업데이트
    await updateJobStatus(jobId, {
      status: "render",
    });

    return NextResponse.json({
      success: true,
      segments,
      totalDuration,
    });
  } catch (error) {
    console.error("[SplitAudio API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "음성 분할 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}

