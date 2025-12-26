/**
 * SceneManager - 씬별 영상 생성 관리
 * 
 * 역할:
 * 1. 각 씬별 영상 프롬프트 생성
 * 2. AI 영상 생성 요청 (Veo/Higgsfield)
 * 3. 씬 상태 관리 및 재시도
 */

import { generateVideoPrompts } from '@/lib/openrouter';
import { requestVeoVideo, getVeoVideoResult } from '@/lib/veo';
import { requestHiggsfieldVideo, getHiggsfieldVideoResult } from '@/lib/higgsfield';
import { downloadFile } from '@/lib/storage';
import type { Scene, SceneGenerationResult, SCENE_DURATION_LIMITS } from '@/core/types';
import path from 'path';
import fs from 'fs/promises';

// 씬 길이 제한 (밀리초)
const MIN_DURATION_MS = 4000;
const MAX_DURATION_MS = 8000;

type VideoProvider = 'veo' | 'higgsfield';
type VideoGenerationMode = 'text-to-video-with-audio' | 'video-then-audio';
type HiggsfieldModel = 'seedance-1.5' | 'kling-2.6' | 'wan-2.6' | 'minimax-hailuo';

export class SceneManager {
  private jobId: string;
  private outputDir: string;
  private videoProvider: VideoProvider;
  private videoGenerationMode: VideoGenerationMode;
  private higgsfieldModel: HiggsfieldModel;
  private topic: string;
  private category?: string;
  
  constructor(options: {
    jobId: string;
    topic: string;
    category?: string;
    videoProvider?: VideoProvider;
    videoGenerationMode?: VideoGenerationMode;
    higgsfieldModel?: string;
  }) {
    this.jobId = options.jobId;
    this.topic = options.topic;
    this.category = options.category;
    this.videoProvider = options.videoProvider || 'veo';
    this.higgsfieldModel = (options.higgsfieldModel as HiggsfieldModel) || 'seedance-1.5';
    // Veo는 text-to-video-with-audio, 나머지는 video-then-audio
    this.videoGenerationMode = options.videoGenerationMode || 
      (this.videoProvider === 'veo' ? 'text-to-video-with-audio' : 'video-then-audio');
    this.outputDir = path.join(process.cwd(), 'public', 'videos', 'jobs', options.jobId);
    
    console.log(`[SceneManager] 초기화: provider=${this.videoProvider}, model=${this.higgsfieldModel}`);
  }

  /**
   * 영상 생성 모드 반환
   */
  getVideoGenerationMode(): VideoGenerationMode {
    return this.videoGenerationMode;
  }

  /**
   * 모든 씬에 대한 영상 프롬프트 생성
   */
  async generatePrompts(scenes: Scene[]): Promise<Scene[]> {
    console.log(`[SceneManager] ${scenes.length}개 씬 프롬프트 생성 시작`);
    
    let previousPrompt = '';
    const updatedScenes: Scene[] = [];
    
    for (const scene of scenes) {
      try {
        console.log(`[SceneManager] 씬 ${scene.id}/${scenes.length} 프롬프트 생성 중...`);
        
        const prompts = await generateVideoPrompts({
          topic: this.topic,
          category: this.category,
          scriptSections: [scene.text],
          clipCount: scenes.length,
          sceneIndex: scene.id - 1,
          totalScenes: scenes.length,
          previousPrompt,
        });
        
        const prompt = prompts[0] || this.createFallbackPrompt(scene.text);
        previousPrompt = prompt;
        
        updatedScenes.push({
          ...scene,
          prompt,
        });
        
        console.log(`  [${scene.id}] ✅ 프롬프트 생성 완료`);
      } catch (error) {
        console.error(`  [${scene.id}] ❌ 프롬프트 생성 실패:`, error);
        updatedScenes.push({
          ...scene,
          prompt: this.createFallbackPrompt(scene.text),
        });
      }
    }
    
    return updatedScenes;
  }

  /**
   * 폴백 프롬프트 생성
   */
  private createFallbackPrompt(text: string): string {
    return `Cinematic vertical 9:16 video, warm soft lighting, smooth slow camera movement, cozy atmosphere. Visual interpretation of: ${text.substring(0, 100)}`;
  }

  /**
   * 모든 씬에 대한 영상 생성 요청
   */
  async requestVideos(scenes: Scene[]): Promise<Scene[]> {
    console.log(`[SceneManager] ${scenes.length}개 씬 영상 생성 요청 시작`);
    console.log(`  [모드] ${this.videoProvider} / ${this.videoGenerationMode}`);
    
    await fs.mkdir(this.outputDir, { recursive: true });
    
    const updatedScenes: Scene[] = [];
    
    for (const scene of scenes) {
      if (!scene.prompt) {
        console.error(`  [${scene.id}] 프롬프트 없음, 건너뜀`);
        updatedScenes.push({ ...scene, videoStatus: 'failed', errorMessage: '프롬프트 없음' });
        continue;
      }
      
      try {
        console.log(`[SceneManager] 씬 ${scene.id}/${scenes.length} 영상 요청 중...`);
        
        // 요청할 영상 길이 결정 (4~8초 범위)
        const audioDurationSec = scene.audioDurationMs && !isNaN(scene.audioDurationMs) 
          ? scene.audioDurationMs / 1000 
          : 6;
        const targetDurationSec = Math.max(4, Math.min(8, Math.round(audioDurationSec)));
        
        let jobId: string;
        let audioIncluded = false;
        
        if (this.videoProvider === 'veo') {
          // ========================================
          // Veo 3: Text-to-Video with Audio
          // 프롬프트에 대사를 포함하여 음성 자체 생성
          // ========================================
          const veoPrompt = this.videoGenerationMode === 'text-to-video-with-audio'
            ? this.createVeoPromptWithDialogue(scene.prompt, scene.text)
            : scene.prompt;
          
          console.log(`  [${scene.id}] Veo (${this.videoGenerationMode}): ${targetDurationSec}초`);
          
          const result = await requestVeoVideo({
            prompt: veoPrompt,
            model: 'veo-3.1',
            duration: targetDurationSec,
            aspectRatio: '9:16',
          });
          jobId = result.jobId;
          audioIncluded = this.videoGenerationMode === 'text-to-video-with-audio';
          
        } else {
          // ========================================
          // Higgsfield: Video-then-Audio
          // 영상만 생성, 음성은 별도 합성 필요
          // ========================================
          console.log(`  [${scene.id}] Higgsfield (${this.higgsfieldModel}) - video-then-audio: ${targetDurationSec}초`);
          
          const result = await requestHiggsfieldVideo({
            prompt: scene.prompt,
            model: this.higgsfieldModel,
            duration: targetDurationSec,
            aspectRatio: '9:16',
          });
          jobId = result.jobId;
          audioIncluded = false;
        }
        
        updatedScenes.push({
          ...scene,
          videoStatus: 'generating',
          videoPath: jobId, // 임시로 jobId 저장
          audioIncluded,
        });
        
        console.log(`  [${scene.id}] ✅ 요청 완료: ${jobId} (음성포함: ${audioIncluded})`);
      } catch (error) {
        console.error(`  [${scene.id}] ❌ 영상 요청 실패:`, error);
        updatedScenes.push({
          ...scene,
          videoStatus: 'failed',
          errorMessage: error instanceof Error ? error.message : '알 수 없는 오류',
        });
      }
    }
    
    return updatedScenes;
  }

  /**
   * Veo용 프롬프트에 대사 추가 (음성 자체 생성용)
   * Veo 3는 프롬프트에 대사를 포함하면 영상에 음성을 자동으로 생성합니다.
   */
  private createVeoPromptWithDialogue(visualPrompt: string, dialogue: string): string {
    // Veo 3 음성 생성을 위한 프롬프트 형식
    // 대사를 명확하게 포함하고, 나레이터 스타일 지정
    return `${visualPrompt}

A warm female Korean narrator speaks clearly: "${dialogue}"

Voice style: Professional Korean female narrator, clear pronunciation, warm and friendly tone, natural speech rhythm. The voice narration should be synchronized with the visuals.`;
  }

  /**
   * 씬 영상 상태 확인 및 다운로드
   */
  async checkAndDownloadVideos(scenes: Scene[]): Promise<Scene[]> {
    console.log(`[SceneManager] 씬 영상 상태 확인 중...`);
    
    const updatedScenes: Scene[] = [];
    
    for (const scene of scenes) {
      // 이미 완료되었거나 실패한 씬은 건너뜀
      if (scene.videoStatus === 'completed' || scene.videoStatus === 'failed' || scene.videoStatus === 'adjusted') {
        updatedScenes.push(scene);
        continue;
      }
      
      // generating 상태가 아니면 건너뜀
      if (scene.videoStatus !== 'generating' || !scene.videoPath) {
        updatedScenes.push(scene);
        continue;
      }
      
      const videoJobId = scene.videoPath; // 임시로 저장된 jobId
      
      try {
        // 상태 확인
        let result;
        if (this.videoProvider === 'veo') {
          result = await getVeoVideoResult(videoJobId);
        } else {
          result = await getHiggsfieldVideoResult(videoJobId);
        }
        
        if (result.status === 'completed' && result.videoUrl) {
          // 영상 다운로드
          console.log(`  [${scene.id}] 다운로드 중...`);
          const videoBuffer = await downloadFile(result.videoUrl);
          
          const videoFileName = `scene_${String(scene.id).padStart(2, '0')}.mp4`;
          const videoPath = path.join(this.outputDir, videoFileName);
          await fs.writeFile(videoPath, videoBuffer);
          
          // 영상 길이 측정
          const { exec } = require('child_process');
          const { promisify } = require('util');
          const execAsync = promisify(exec);
          
          const { stdout } = await execAsync(
            `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`
          );
          const durationSec = parseFloat(stdout.trim());
          const durationMs = Math.round(durationSec * 1000);
          
          updatedScenes.push({
            ...scene,
            videoPath: `/videos/jobs/${this.jobId}/${videoFileName}`,
            videoDurationMs: durationMs,
            videoStatus: 'completed',
          });
          
          console.log(`  [${scene.id}] ✅ 완료 (${durationMs}ms)`);
        } else if (result.status === 'failed') {
          updatedScenes.push({
            ...scene,
            videoStatus: 'failed',
            errorMessage: result.errorMessage || '영상 생성 실패',
          });
          console.log(`  [${scene.id}] ❌ 실패: ${result.errorMessage}`);
        } else {
          // 아직 생성 중
          updatedScenes.push(scene);
          console.log(`  [${scene.id}] ⏳ 생성 중...`);
        }
      } catch (error) {
        console.error(`  [${scene.id}] 상태 확인 오류:`, error);
        updatedScenes.push(scene);
      }
    }
    
    return updatedScenes;
  }

  /**
   * 특정 씬만 재생성
   */
  async retryScene(scene: Scene): Promise<Scene> {
    console.log(`[SceneManager] 씬 ${scene.id} 재생성 시작`);
    
    // 프롬프트가 없으면 생성
    if (!scene.prompt) {
      scene.prompt = this.createFallbackPrompt(scene.text);
    }
    
    const scenes = await this.requestVideos([{ ...scene, videoStatus: 'pending' }]);
    return scenes[0];
  }

  /**
   * 씬 상태 요약
   */
  getScenesSummary(scenes: Scene[]): {
    total: number;
    pending: number;
    generating: number;
    completed: number;
    failed: number;
    adjusted: number;
  } {
    return {
      total: scenes.length,
      pending: scenes.filter(s => s.videoStatus === 'pending').length,
      generating: scenes.filter(s => s.videoStatus === 'generating').length,
      completed: scenes.filter(s => s.videoStatus === 'completed').length,
      failed: scenes.filter(s => s.videoStatus === 'failed').length,
      adjusted: scenes.filter(s => s.videoStatus === 'adjusted').length,
    };
  }
}

// 팩토리 함수
export function createSceneManager(options: {
  jobId: string;
  topic: string;
  category?: string;
  videoProvider?: VideoProvider;
  videoGenerationMode?: VideoGenerationMode;
  higgsfieldModel?: string;
}): SceneManager {
  return new SceneManager(options);
}

