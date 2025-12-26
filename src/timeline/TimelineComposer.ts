/**
 * TimelineComposer - 타임라인 조립
 * 
 * 역할:
 * 1. 음성 타임라인 기준으로 영상 배치
 * 2. 전환 효과 적용
 * 3. 씬들을 하나의 영상으로 합성
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import type { Scene, CompositionResult, TimelineOptions } from '@/core/types';

const execAsync = promisify(exec);

type TransitionPreset = 'smash_cut' | 'whip_pan' | 'scale_in' | 'fade' | 'none';

export class TimelineComposer {
  private jobId: string;
  private outputDir: string;
  private options: TimelineOptions;
  
  constructor(jobId: string, options: Partial<TimelineOptions> = {}) {
    this.jobId = jobId;
    this.outputDir = path.join(process.cwd(), 'public', 'videos', 'jobs', jobId);
    this.options = {
      scriptAI: 'claude',
      videoAI: 'veo',
      videoGenerationMode: 'text-to-video-with-audio', // Veo 기본값
      resolution: { width: 1080, height: 1920 },
      aspectRatio: '9:16',
      fps: 30,
      transitionPreset: options.transitionPreset || 'smash_cut',
      transitionDurationMs: options.transitionDurationMs || 200,
      enableSubtitles: options.enableSubtitles ?? true,
      enableBGM: options.enableBGM ?? false,
      bgmVolume: options.bgmVolume ?? 0.3,
      enableDucking: options.enableDucking ?? true,
      ...options,
    };
  }

  /**
   * 모든 씬을 하나의 영상으로 합성
   */
  async compose(scenes: Scene[]): Promise<CompositionResult> {
    console.log(`[TimelineComposer] ${scenes.length}개 씬 합성 시작`);
    
    await fs.mkdir(this.outputDir, { recursive: true });
    
    // 완료된/보정된 씬만 필터링
    const validScenes = scenes
      .filter(s => (s.videoStatus === 'adjusted' || s.videoStatus === 'completed') && (s.adjustedVideoPath || s.videoPath))
      .sort((a, b) => a.id - b.id);
    
    if (validScenes.length === 0) {
      throw new Error('합성할 수 있는 씬이 없습니다');
    }
    
    // 전환 효과에 따라 합성 방식 선택
    let outputPath: string;
    
    if (this.options.transitionPreset === 'smash_cut' || this.options.transitionPreset === 'none') {
      outputPath = await this.composeWithConcatDemuxer(validScenes);
    } else {
      outputPath = await this.composeWithTransitions(validScenes);
    }
    
    // 최종 길이 확인
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outputPath}"`
    );
    const totalDurationMs = Math.round(parseFloat(stdout.trim()) * 1000);
    
    console.log(`[TimelineComposer] 합성 완료: ${totalDurationMs}ms`);
    
    return {
      outputPath: `/videos/jobs/${this.jobId}/composed.mp4`,
      totalDurationMs,
      scenesIncluded: validScenes.length,
    };
  }

  /**
   * 단순 연결 (smash cut - 가장 빠름)
   * 각 씬 영상에 이미 음성이 더빙되어 있으므로 그대로 연결
   */
  private async composeWithConcatDemuxer(scenes: Scene[]): Promise<string> {
    const listPath = path.join(this.outputDir, 'video_list.txt');
    const outputPath = path.join(this.outputDir, 'composed.mp4');
    
    // 파일 리스트 생성
    const listContent = scenes
      .map(s => {
        const videoPath = s.adjustedVideoPath || s.videoPath;
        return `file '${path.join(process.cwd(), 'public', videoPath!)}'`;
      })
      .join('\n');
    await fs.writeFile(listPath, listContent);
    
    // FFmpeg concat demuxer로 연결 (영상+오디오 모두 포함)
    // -c:v libx264: 영상 재인코딩 (호환성)
    // -c:a aac: 오디오 재인코딩 (호환성)
    const cmd = `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 192k "${outputPath}"`;
    
    console.log(`[TimelineComposer] 씬 연결 명령어:`, cmd);
    await execAsync(cmd);
    
    // 임시 파일 삭제
    await fs.unlink(listPath);
    
    return outputPath;
  }

  /**
   * 전환 효과와 함께 합성
   */
  private async composeWithTransitions(scenes: Scene[]): Promise<string> {
    const outputPath = path.join(this.outputDir, 'composed.mp4');
    const transitionDurationSec = this.options.transitionDurationMs / 1000;
    
    if (scenes.length === 1) {
      // 씬이 하나면 전환 불필요
      const videoPath = scenes[0].adjustedVideoPath || scenes[0].videoPath;
      const srcPath = path.join(process.cwd(), 'public', videoPath!);
      await fs.copyFile(srcPath, outputPath);
      return outputPath;
    }
    
    // xfade 필터를 사용한 전환 효과
    const inputs = scenes.map(s => {
      const videoPath = s.adjustedVideoPath || s.videoPath;
      return `-i "${path.join(process.cwd(), 'public', videoPath!)}"`;
    }).join(' ');
    
    // 전환 효과 매핑
    const xfadeType = this.getXfadeType(this.options.transitionPreset);
    
    // 복잡한 필터 그래프 생성
    let filterComplex = '';
    let lastOutput = '[0:v]';
    
    for (let i = 1; i < scenes.length; i++) {
      const offset = scenes.slice(0, i).reduce((sum, s) => {
        return sum + (s.audioDurationMs / 1000) - transitionDurationSec;
      }, 0);
      
      const currentOutput = i === scenes.length - 1 ? '[outv]' : `[v${i}]`;
      filterComplex += `${lastOutput}[${i}:v]xfade=transition=${xfadeType}:duration=${transitionDurationSec}:offset=${offset}${currentOutput}`;
      
      if (i < scenes.length - 1) {
        filterComplex += ';';
      }
      
      lastOutput = currentOutput;
    }
    
    // 오디오도 crossfade
    let audioFilter = '';
    let lastAudioOutput = '[0:a]';
    
    for (let i = 1; i < scenes.length; i++) {
      const offset = scenes.slice(0, i).reduce((sum, s) => {
        return sum + (s.audioDurationMs / 1000) - transitionDurationSec;
      }, 0);
      
      const currentAudioOutput = i === scenes.length - 1 ? '[outa]' : `[a${i}]`;
      audioFilter += `;${lastAudioOutput}[${i}:a]acrossfade=d=${transitionDurationSec}:c1=tri:c2=tri${currentAudioOutput}`;
      lastAudioOutput = currentAudioOutput;
    }
    
    const fullFilter = filterComplex + audioFilter;
    
    const cmd = `ffmpeg -y ${inputs} -filter_complex "${fullFilter}" -map "[outv]" -map "[outa]" -c:v libx264 -preset fast -crf 23 -c:a aac "${outputPath}"`;
    
    try {
      await execAsync(cmd);
    } catch (error) {
      // 복잡한 필터 실패 시 단순 연결로 폴백
      console.warn('[TimelineComposer] 전환 효과 적용 실패, 단순 연결로 대체');
      return this.composeWithConcatDemuxer(scenes);
    }
    
    return outputPath;
  }

  /**
   * 전환 효과 타입 변환
   */
  private getXfadeType(preset: TransitionPreset): string {
    const mapping: Record<TransitionPreset, string> = {
      'smash_cut': 'fade',
      'whip_pan': 'wipeleft',
      'scale_in': 'zoomin',
      'fade': 'fade',
      'none': 'fade',
    };
    return mapping[preset] || 'fade';
  }

  /**
   * 영상에 오디오 합성
   */
  async addAudioToVideo(videoPath: string, audioPath: string): Promise<string> {
    const inputVideoPath = path.join(process.cwd(), 'public', videoPath);
    const inputAudioPath = path.join(process.cwd(), 'public', audioPath);
    const outputPath = path.join(this.outputDir, 'composed_with_audio.mp4');
    
    // 영상의 오디오를 제거하고 새 오디오로 교체
    const cmd = `ffmpeg -y -i "${inputVideoPath}" -i "${inputAudioPath}" -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 -shortest "${outputPath}"`;
    await execAsync(cmd);
    
    return `/videos/jobs/${this.jobId}/composed_with_audio.mp4`;
  }

  /**
   * 타임라인 JSON 저장
   */
  async saveTimelineJson(scenes: Scene[], totalDurationMs: number): Promise<string> {
    const timeline = {
      id: this.jobId,
      duration: totalDurationMs,
      scenes: scenes.map(s => ({
        id: s.id,
        text: s.text,
        audio: s.audioPath,
        audioDuration: s.audioDurationMs,
        video: s.adjustedVideoPath || s.videoPath,
        videoDuration: s.videoDurationMs,
        videoHandled: s.videoStatus === 'adjusted' || s.videoStatus === 'completed',
        adjustmentType: s.adjustmentType,
        startTime: s.startTimeMs,
        endTime: s.endTimeMs,
      })),
    };
    
    const jsonPath = path.join(this.outputDir, 'timeline.json');
    await fs.writeFile(jsonPath, JSON.stringify(timeline, null, 2));
    
    return `/videos/jobs/${this.jobId}/timeline.json`;
  }
}

// 팩토리 함수
export function createTimelineComposer(jobId: string, options?: Partial<TimelineOptions>): TimelineComposer {
  return new TimelineComposer(jobId, options);
}

