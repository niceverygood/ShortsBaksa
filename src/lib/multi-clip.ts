/**
 * 멀티 클립 영상 생성 (개선된 워크플로우)
 * 
 * 워크플로우:
 * 1. 스크립트 생성 및 TTS 작업
 * 2. 오디오 길이 측정 및 10초 단위 분할
 * 3. 분할된 스크립트 기반으로 영상 프롬프트 생성
 * 4. 각 프롬프트로 영상 생성
 * 5. 영상 합치기
 */

import { requestHiggsfieldVideo, getHiggsfieldVideoResult } from './higgsfield';
import { requestVeoVideo, getVeoVideoResult } from './veo';
import { downloadFile, saveVideo } from './storage';
import { mergeVideosWithAudioSync, getAudioDuration, getVideoDuration, createFillerFromLastFrame } from './ffmpeg';
import { generateVideoPrompts } from './openrouter';
import path from 'path';
import fs from 'fs/promises';
import type { MultiClipStep, ClipInfo, HiggsfieldModel } from '@/types';

const CLIP_DURATION = 10; // 각 클립 10초
const VEO_CLIP_DURATION = 8; // Veo 전용 클립 길이 (최대 8초)

/**
 * 스크립트를 문장 단위로 분할
 */
function splitIntoSentences(script: string): string[] {
  return script
    .split(/(?<=[.!?。])\s*/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

export interface ScriptSection {
  text: string;
  duration: number;
}

/**
 * 스크립트를 오디오 길이에 맞춰 문장 단위로 최적 분할하고 각 섹션의 기간을 계산합니다.
 * 사용자가 선택한 목표 길이에 구속되지 않고, 음성과 영상이 일치하도록 유연하게 조정합니다.
 */
export function splitScriptWithDurations(
  script: string, 
  audioDuration: number, 
  targetClipDuration: number = CLIP_DURATION,
  minDuration: number = 4,
  maxDuration: number = 10
): ScriptSection[] {
  const sentences = splitIntoSentences(script);
  const totalChars = script.length;
  const charsPerSecond = totalChars / audioDuration;
  
  const sections: ScriptSection[] = [];
  let currentSentences: string[] = [];
  let currentDuration = 0;
  
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const sentenceDuration = sentence.length / charsPerSecond;
    
    // 다음 문장을 추가했을 때 목표 길이를 넘거나, 마지막 문장인 경우 섹션 확정
    const willExceedTarget = currentDuration + sentenceDuration > targetClipDuration + 1.5;
    const isLastSentence = i === sentences.length - 1;
    
    if ((willExceedTarget && currentSentences.length > 0) || isLastSentence) {
      if (isLastSentence) {
        currentSentences.push(sentence);
        currentDuration += sentenceDuration;
      }
      
      let finalDuration = currentDuration;
      
      // API 제약 조건(Veo 4-8s 등)에 맞춰 기간 보정
      if (finalDuration < minDuration) finalDuration = minDuration;
      if (finalDuration > maxDuration) finalDuration = maxDuration;
      
      sections.push({
        text: currentSentences.join(' '),
        duration: Math.round(finalDuration * 10) / 10 // 소수점 첫째자리까지
      });
      
      if (!isLastSentence) {
        currentSentences = [sentence];
        currentDuration = sentenceDuration;
      }
    } else {
      currentSentences.push(sentence);
      currentDuration += sentenceDuration;
    }
  }
  
  // 전체 기간 보정: 모든 섹션의 합이 오디오 총 길이와 비슷하도록 비례 조정
  const totalCalculatedDuration = sections.reduce((sum, s) => sum + s.duration, 0);
  const scaleFactor = audioDuration / totalCalculatedDuration;
  
  const finalSections = sections.map(s => {
    let scaledDuration = s.duration * scaleFactor;
    // 다시 한 번 API 제약 조건 확인
    if (scaledDuration < minDuration) scaledDuration = minDuration;
    if (scaledDuration > maxDuration) scaledDuration = maxDuration;
    
    return {
      text: s.text,
      duration: Math.round(scaledDuration * 10) / 10
    };
  });
  
  console.log(`[MultiClip] 유연한 분할 완료: ${finalSections.length}개 클립 (오디오: ${audioDuration.toFixed(1)}초, 평균: ${(audioDuration/finalSections.length).toFixed(1)}초)`);
  return finalSections;
}

/**
 * 클립 정보 초기화 (ScriptSection 기반)
 */
export function initializeClipsFromSections(
  sections: ScriptSection[]
): ClipInfo[] {
  return sections.map((section, index) => ({
    index,
    scriptSection: section.text,
    prompt: '',
    duration: section.duration,
    status: 'pending' as const,
  }));
}

/**
 * 일관된 비주얼 스타일 기본 프롬프트
 */
const BASE_VISUAL_STYLE = `
Professional Korean lifestyle video style.
Warm, inviting colors with soft natural lighting.
Clean, modern aesthetic suitable for 50-60 year old Korean audience.
Calm and trustworthy atmosphere.
High quality cinematic footage.
Smooth camera movements.
9:16 vertical format for YouTube Shorts.
`.trim();

/**
 * 작업 단계 초기화
 */
export function initializeSteps(): MultiClipStep[] {
  return [
    { id: 'script', name: '📝 스크립트 생성', status: 'pending' },
    { id: 'tts', name: '🎤 음성(TTS) 생성', status: 'pending' },
    { id: 'split', name: '✂️ 스크립트 분할', status: 'pending' },
    { id: 'prompts', name: '🎨 영상 프롬프트 생성', status: 'pending' },
    { id: 'render', name: '🎬 영상 렌더링', status: 'pending' },
    { id: 'merge', name: '🔗 영상 합치기', status: 'pending' },
  ];
}

/**
 * 단계 상태 업데이트
 */
export function updateStep(
  steps: MultiClipStep[], 
  stepId: string, 
  updates: Partial<MultiClipStep>
): MultiClipStep[] {
  return steps.map(step => 
    step.id === stepId ? { ...step, ...updates } : step
  );
}

/**
 * 클립 정보 초기화
 */
export function initializeClips(
  scriptSections: string[],
  clipDuration: number = CLIP_DURATION
): ClipInfo[] {
  return scriptSections.map((section, index) => ({
    index,
    scriptSection: section,
    prompt: '',
    duration: clipDuration,
    status: 'pending' as const,
  }));
}

/**
 * AI로 영상 프롬프트 생성
 */
export async function generateClipPrompts(
  clips: ClipInfo[],
  topic: string,
  category?: string
): Promise<ClipInfo[]> {
  console.log(`[MultiClip] ${clips.length}개 클립 프롬프트 생성 시작...`);
  
  const updatedClips = [...clips];
  let lastPrompt = ''; // 이전 장면 프롬프트 추적용
  
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    
    console.log(`[MultiClip] 클립 ${i + 1}/${clips.length} 프롬프트 생성 중...`);
    
    try {
      const prompts = await generateVideoPrompts({
        topic,
        category,
        scriptSections: [clip.scriptSection],
        clipCount: 1,
        sceneIndex: i,
        totalScenes: clips.length,
        previousPrompt: lastPrompt, // 이전 프롬프트 전달
      });
      
      const currentPrompt = prompts[0] || `Scene ${i + 1}: ${clip.scriptSection.substring(0, 100)}`;
      
      updatedClips[i] = {
        ...clip,
        prompt: currentPrompt,
      };
      
      lastPrompt = currentPrompt; // 현재 프롬프트를 다음 장면을 위해 저장
      
      console.log(`[MultiClip] 클립 ${i + 1} 프롬프트 생성 완료`);
      
    } catch (error) {
      console.error(`[MultiClip] 클립 ${i + 1} 프롬프트 생성 실패:`, error);
      // 실패 시 기본 프롬프트 사용
      const fallbackPrompt = `${BASE_VISUAL_STYLE}\n\nScene ${i + 1} of ${clips.length}:\nContent: ${clip.scriptSection.substring(0, 200)}`;
      updatedClips[i] = {
        ...clip,
        prompt: fallbackPrompt,
      };
      lastPrompt = fallbackPrompt;
    }
    
    // API 레이트 리밋 방지
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  return updatedClips;
}

/**
 * 클립 영상 생성 요청
 */
export async function requestClipVideos(
  clips: ClipInfo[],
  provider: 'higgsfield' | 'veo' = 'higgsfield',
  model: string = 'veo-3.1'
): Promise<ClipInfo[]> {
  console.log(`[MultiClip] ${clips.length}개 클립 영상 생성 요청 시작 (Provider: ${provider}, Model: ${model})...`);
  
  const updatedClips = [...clips];
  
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    
    // Veo의 경우 duration이 4~8초 사이여야 함
    let duration = clip.duration;
    if (provider === 'veo') {
      if (duration < 4) duration = 4;
      if (duration > 8) duration = 8;
    }
    
    console.log(`[MultiClip] 클립 ${i + 1}/${clips.length} 영상 생성 요청 중 (길이: ${duration}초)...`);
    
    try {
      let result: { jobId: string };
      
      if (provider === 'veo') {
        result = await requestVeoVideo({
          prompt: clip.prompt,
          model: model as any,
          aspectRatio: '9:16',
          duration: duration,
        });
      } else {
        result = await requestHiggsfieldVideo({
          prompt: clip.prompt,
          model: model as any,
          aspectRatio: '9:16',
          duration: duration,
        });
      }
      
      updatedClips[i] = {
        ...clip,
        duration: duration, // 실제 요청된 길이로 업데이트
        status: 'processing',
        jobId: result.jobId,
      };
      
      console.log(`[MultiClip] 클립 ${i + 1} 요청 완료: ${result.jobId}`);
      
    } catch (error) {
      console.error(`[MultiClip] 클립 ${i + 1} 요청 실패:`, error);
      updatedClips[i] = {
        ...clip,
        status: 'failed',
      };
    }
    
    // API 레이트 리밋 방지 (Veo는 조금 더 여유있게)
    const delay = provider === 'veo' ? 3000 : 2000;
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  
  return updatedClips;
}

/**
 * 클립 상태 확인 및 다운로드
 */
export async function checkAndDownloadClips(
  clips: ClipInfo[],
  jobId: string
): Promise<{ clips: ClipInfo[]; allCompleted: boolean }> {
  console.log(`[MultiClip] 클립 상태 확인 시작...`);
  
  const updatedClips = [...clips];
  let pendingCount = 0;
  let completedCount = 0;
  let failedCount = 0;
  
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    
    // 이미 완료된 클립은 건너뛰기
    if (clip.status === 'completed' || clip.status === 'failed') {
      if (clip.status === 'completed') completedCount++;
      else failedCount++;
      continue;
    }
    
    if (!clip.jobId) {
      failedCount++;
      continue;
    }
    
    try {
      let result;
      if (clip.jobId.startsWith('veo|')) {
        result = await getVeoVideoResult(clip.jobId);
      } else {
        result = await getHiggsfieldVideoResult(clip.jobId);
      }
      
      if (result.status === 'completed' && result.videoUrl) {
        // 영상 다운로드 및 저장
        console.log(`[MultiClip] 클립 ${i + 1} 다운로드 중...`);
        const videoBuffer = await downloadFile(result.videoUrl);
        const clipFileName = `clip-${jobId}-${i + 1}-${Date.now()}.mp4`;
        const savedResult = await saveVideo({
          buffer: videoBuffer,
          fileName: clipFileName,
        });
        
        updatedClips[i] = {
          ...clip,
          status: 'completed',
          videoUrl: savedResult.url,
        };
        completedCount++;
        console.log(`[MultiClip] 클립 ${i + 1} 완료: ${savedResult.url}`);
        
      } else if (result.status === 'failed') {
        updatedClips[i] = {
          ...clip,
          status: 'failed',
        };
        failedCount++;
        console.log(`[MultiClip] 클립 ${i + 1} 실패`);
        
      } else {
        pendingCount++;
      }
      
    } catch (error) {
      console.error(`[MultiClip] 클립 ${i + 1} 상태 확인 실패:`, error);
      pendingCount++;
    }
    
    // API 레이트 리밋 방지
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log(`[MultiClip] 진행 상황: ${completedCount} 완료, ${pendingCount} 진행중, ${failedCount} 실패`);
  
  return {
    clips: updatedClips,
    allCompleted: pendingCount === 0,
  };
}

/**
 * 클립들을 하나의 영상으로 합치기
 * 실패한 클립은 성공한 클립의 마지막 프레임으로 대체하여
 * 모든 대사가 끝날 때까지 영상이 이어지도록 합니다.
 */
export async function mergeClipsIntoVideo(
  clips: ClipInfo[],
  outputPath: string,
  audioPath?: string,
  audioDuration?: number
): Promise<string> {
  // 완료된 클립들만 필터링하고 순서대로 정렬
  const completedClips = clips
    .filter(clip => clip.status === 'completed' && clip.videoUrl)
    .sort((a, b) => a.index - b.index);
  
  if (completedClips.length === 0) {
    throw new Error('합칠 수 있는 완료된 클립이 없습니다.');
  }
  
  const totalClips = clips.length;
  const failedClips = clips.filter(clip => clip.status === 'failed' || clip.status === 'pending');
  
  console.log(`[MultiClip] 클립 현황: ${completedClips.length}/${totalClips} 성공, ${failedClips.length} 실패/대기`);
  
  // 로컬 파일 경로로 변환
  const clipPaths = completedClips.map(clip => {
    const urlPath = clip.videoUrl!.startsWith('/') 
      ? clip.videoUrl! 
      : new URL(clip.videoUrl!).pathname;
    return path.join(process.cwd(), 'public', urlPath);
  });
  
  // 오디오 경로가 있으면 오디오 동기화 합성 사용
  if (audioPath) {
    // 절대 경로인지 확인 (이미 절대 경로면 그대로 사용)
    const localAudioPath = path.isAbsolute(audioPath) 
      ? audioPath
      : path.join(process.cwd(), 'public', audioPath);
    
    console.log(`[MultiClip] ${completedClips.length}개 클립을 오디오와 동기화하여 합치기 시작...`);
    
    // 오디오 길이에 맞춰 영상 합치기 (부족하면 자동으로 filler 추가)
    await mergeVideosWithAudioSync(clipPaths, localAudioPath, outputPath);
    
    console.log(`[MultiClip] 오디오 동기화 영상 합치기 완료: ${outputPath}`);
    return outputPath;
  }
  
  // 오디오가 없으면 기존 방식으로 합치기
  const { mergeVideos } = await import('./ffmpeg');
  await mergeVideos(clipPaths, outputPath);
  
  console.log(`[MultiClip] 영상 합치기 완료: ${outputPath}`);
  return outputPath;
}

/**
 * 실패한 클립을 성공한 클립의 마지막 프레임으로 대체하는 filler를 생성합니다.
 */
export async function createFillerForFailedClips(
  clips: ClipInfo[],
  totalDuration: number
): Promise<{ fillerPaths: string[]; totalFillerDuration: number }> {
  const completedClips = clips.filter(c => c.status === 'completed' && c.videoUrl);
  const failedClips = clips.filter(c => c.status === 'failed' || !c.videoUrl);
  
  if (completedClips.length === 0) {
    throw new Error('참조할 완료된 클립이 없습니다.');
  }
  
  // 마지막으로 성공한 클립의 경로
  const lastCompletedClip = completedClips[completedClips.length - 1];
  const lastVideoUrl = lastCompletedClip.videoUrl!;
  const lastVideoPath = lastVideoUrl.startsWith('/') 
    ? path.join(process.cwd(), 'public', lastVideoUrl)
    : lastVideoUrl;
  
  const fillerPaths: string[] = [];
  let totalFillerDuration = 0;
  
  // 실패한 클립 각각에 대해 filler 생성
  for (const failedClip of failedClips) {
    const fillerDuration = failedClip.duration || 8;
    const fillerPath = path.join(
      process.cwd(), 
      'public/videos', 
      `filler-${failedClip.index}-${Date.now()}.mp4`
    );
    
    try {
      await createFillerFromLastFrame(lastVideoPath, fillerPath, fillerDuration);
      fillerPaths.push(fillerPath);
      totalFillerDuration += fillerDuration;
      console.log(`[MultiClip] Filler ${failedClip.index + 1} 생성 완료 (${fillerDuration}초)`);
    } catch (error) {
      console.error(`[MultiClip] Filler ${failedClip.index + 1} 생성 실패:`, error);
    }
  }
  
  return { fillerPaths, totalFillerDuration };
}
