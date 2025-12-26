/**
 * AudioManager - 음성 생성 및 분할
 * 
 * 역할:
 * 1. 전체 스크립트 TTS 생성
 * 2. 문장별 음성 분할 (silence detection)
 * 3. 타임라인 JSON 생성
 */

import { generateTTS } from '@/lib/elevenlabs';
import { getAudioDuration } from '@/lib/ffmpeg';
import type { AudioResult, AudioSegment, Scene } from '@/core/types';
import path from 'path';
import fs from 'fs/promises';

export class AudioManager {
  private outputDir: string;
  
  constructor(jobId: string) {
    this.outputDir = path.join(process.cwd(), 'public', 'audio', 'jobs', jobId);
  }

  /**
   * 전체 오디오 생성 및 문장별 분할
   */
  async generateAudio(scenes: Scene[]): Promise<AudioResult> {
    console.log(`[AudioManager] ${scenes.length}개 씬에 대한 음성 생성 시작`);
    
    // 출력 디렉토리 생성
    await fs.mkdir(this.outputDir, { recursive: true });
    
    const segments: AudioSegment[] = [];
    let totalDurationMs = 0;
    
    // 각 씬별로 개별 TTS 생성 (더 정확한 타이밍을 위해)
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      console.log(`[AudioManager] 씬 ${scene.id}/${scenes.length} TTS 생성 중...`);
      
      try {
        const ttsResult = await generateTTS({ script: scene.text });
        
        if (!ttsResult?.audioBuffer) {
          throw new Error('TTS 결과가 없습니다');
        }
        
        // 파일 저장
        const audioFileName = `scene_${String(scene.id).padStart(2, '0')}.mp3`;
        const audioPath = path.join(this.outputDir, audioFileName);
        await fs.writeFile(audioPath, ttsResult.audioBuffer);
        
        // 실제 오디오 길이 측정
        const durationSec = await getAudioDuration(audioPath);
        const durationMs = Math.round(durationSec * 1000);
        
        segments.push({
          index: i,
          text: scene.text,
          audioPath: `/audio/jobs/${path.basename(this.outputDir)}/${audioFileName}`,
          durationMs,
          startTimeMs: totalDurationMs,
          endTimeMs: totalDurationMs + durationMs,
        });
        
        totalDurationMs += durationMs;
        
        console.log(`  [${scene.id}] ✅ ${durationMs}ms`);
      } catch (error) {
        console.error(`  [${scene.id}] ❌ TTS 생성 실패:`, error);
        throw new Error(`씬 ${scene.id} TTS 생성 실패: ${error}`);
      }
    }
    
    // 전체 오디오 병합
    const fullAudioPath = await this.mergeAudioSegments(segments);
    
    console.log(`[AudioManager] 음성 생성 완료: 총 ${Math.round(totalDurationMs / 1000)}초`);
    
    return {
      fullAudioPath,
      fullAudioDurationMs: totalDurationMs,
      segments,
    };
  }

  /**
   * 개별 오디오 파일들을 하나로 병합
   */
  private async mergeAudioSegments(segments: AudioSegment[]): Promise<string> {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    const fullAudioFileName = 'full_audio.mp3';
    const fullAudioPath = path.join(this.outputDir, fullAudioFileName);
    
    // 파일 리스트 생성
    const listPath = path.join(this.outputDir, 'audio_list.txt');
    const listContent = segments
      .map(s => `file '${path.join(process.cwd(), 'public', s.audioPath)}'`)
      .join('\n');
    await fs.writeFile(listPath, listContent);
    
    // FFmpeg로 병합
    const cmd = `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c:a libmp3lame -q:a 2 "${fullAudioPath}"`;
    await execAsync(cmd);
    
    // 임시 파일 삭제
    await fs.unlink(listPath);
    
    return `/audio/jobs/${path.basename(this.outputDir)}/${fullAudioFileName}`;
  }

  /**
   * 씬 배열 업데이트 (오디오 정보 추가)
   */
  updateScenesWithAudio(scenes: Scene[], segments: AudioSegment[]): Scene[] {
    return scenes.map((scene, index) => {
      const segment = segments[index];
      return {
        ...scene,
        audioPath: segment.audioPath,
        audioDurationMs: segment.durationMs,
        startTimeMs: segment.startTimeMs,
        endTimeMs: segment.endTimeMs,
      };
    });
  }

  /**
   * 타임라인 JSON 생성
   */
  generateTimelineJson(segments: AudioSegment[]): object {
    return {
      totalDurationMs: segments.reduce((sum, s) => sum + s.durationMs, 0),
      segmentCount: segments.length,
      segments: segments.map(s => ({
        sceneId: s.index + 1,
        text: s.text,
        durationMs: s.durationMs,
        startTimeMs: s.startTimeMs,
        endTimeMs: s.endTimeMs,
        audioPath: s.audioPath,
      })),
    };
  }

  /**
   * 타임라인 JSON 파일 저장
   */
  async saveTimelineJson(segments: AudioSegment[], filename: string = 'timeline.json'): Promise<string> {
    const timelineJson = this.generateTimelineJson(segments);
    const jsonPath = path.join(this.outputDir, filename);
    await fs.writeFile(jsonPath, JSON.stringify(timelineJson, null, 2));
    return `/audio/jobs/${path.basename(this.outputDir)}/${filename}`;
  }
}

// 팩토리 함수
export function createAudioManager(jobId: string): AudioManager {
  return new AudioManager(jobId);
}

