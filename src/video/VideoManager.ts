/**
 * VideoManager - 영상 길이 보정
 * 
 * 역할:
 * 1. 영상이 음성보다 짧을 때: 루프, 프레임 홀드, Ken Burns 효과
 * 2. 영상이 음성보다 길 때: 트림
 * 3. 각 씬 영상을 정확한 길이로 맞춤
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import type { Scene, VideoAdjustmentResult } from '@/core/types';

const execAsync = promisify(exec);

type AdjustmentType = 'loop' | 'freeze' | 'trim' | 'ken_burns' | 'none';

export class VideoManager {
  private jobId: string;
  private outputDir: string;
  
  constructor(jobId: string) {
    this.jobId = jobId;
    this.outputDir = path.join(process.cwd(), 'public', 'videos', 'jobs', jobId, 'adjusted');
  }

  /**
   * 모든 씬의 영상 길이를 음성에 맞게 보정
   */
  async adjustAllScenes(scenes: Scene[]): Promise<Scene[]> {
    console.log(`[VideoManager] ${scenes.length}개 씬 영상 길이 보정 시작`);
    
    await fs.mkdir(this.outputDir, { recursive: true });
    
    const adjustedScenes: Scene[] = [];
    
    for (const scene of scenes) {
      // 완료된 영상만 보정
      if (scene.videoStatus !== 'completed' || !scene.videoPath || !scene.videoDurationMs) {
        adjustedScenes.push(scene);
        continue;
      }
      
      try {
        const result = await this.adjustScene(scene);
        adjustedScenes.push({
          ...scene,
          adjustmentType: result.adjustmentType,
          adjustedVideoPath: result.adjustedPath,
          videoStatus: 'adjusted',
        });
        console.log(`  [${scene.id}] ✅ ${result.adjustmentType} (${result.originalDurationMs}ms → ${result.finalDurationMs}ms)`);
      } catch (error) {
        console.error(`  [${scene.id}] ❌ 보정 실패:`, error);
        adjustedScenes.push({
          ...scene,
          errorMessage: `보정 실패: ${error}`,
        });
      }
    }
    
    return adjustedScenes;
  }

  /**
   * 단일 씬 영상 보정 + 음성 더빙
   * 
   * Veo 3 (audioIncluded=true): 영상에 이미 음성 포함 → 더빙 건너뜀
   * Higgsfield 등 (audioIncluded=false): 영상에 음성 합성 필요
   */
  async adjustScene(scene: Scene): Promise<VideoAdjustmentResult> {
    const videoDurationMs = scene.videoDurationMs!;
    const audioDurationMs = scene.audioDurationMs;
    const diff = audioDurationMs - videoDurationMs;
    
    const inputPath = path.join(process.cwd(), 'public', scene.videoPath!);
    const tempFileName = `scene_${String(scene.id).padStart(2, '0')}_temp.mp4`;
    const tempPath = path.join(this.outputDir, tempFileName);
    const outputFileName = `scene_${String(scene.id).padStart(2, '0')}_adjusted.mp4`;
    const outputPath = path.join(this.outputDir, outputFileName);
    
    let adjustmentType: AdjustmentType = 'none';
    
    // Veo 3 영상은 음성 포함이므로, 영상 길이 보정만 필요 (더빙 불필요)
    const needsDubbing = !scene.audioIncluded && scene.audioPath;
    
    if (scene.audioIncluded) {
      console.log(`  [${scene.id}] 🎬 Veo 영상 (음성 이미 포함됨)`);
    }
    
    // 차이가 500ms 미만이면 보정 불필요
    if (Math.abs(diff) < 500) {
      // 그냥 복사
      await fs.copyFile(inputPath, needsDubbing ? tempPath : outputPath);
      adjustmentType = 'none';
    } else if (diff > 0) {
      // 영상이 짧음 → 늘려야 함
      const targetPath = needsDubbing ? tempPath : outputPath;
      if (diff <= 2000) {
        // 2초 이하 차이: 프레임 홀드 (마지막 프레임 정지)
        await this.applyFreeze(inputPath, targetPath, audioDurationMs);
        adjustmentType = 'freeze';
      } else if (diff <= 4000) {
        // 2~4초 차이: Ken Burns 효과 (확대/이동)
        await this.applyKenBurns(inputPath, targetPath, audioDurationMs);
        adjustmentType = 'ken_burns';
      } else {
        // 4초 초과: 루프
        await this.applyLoop(inputPath, targetPath, audioDurationMs);
        adjustmentType = 'loop';
      }
    } else {
      // 영상이 김 → 트림
      await this.applyTrim(inputPath, needsDubbing ? tempPath : outputPath, audioDurationMs);
      adjustmentType = 'trim';
    }
    
    // 🎙️ 음성 더빙: Veo가 아닌 경우에만 (Veo는 이미 음성 포함)
    if (needsDubbing) {
      console.log(`  [${scene.id}] 🎙️ 음성 더빙 중...`);
      await this.addAudioToVideo(tempPath, scene.audioPath!, outputPath);
      // 임시 파일 삭제
      await fs.unlink(tempPath).catch(() => {});
    } else if (!scene.audioIncluded && !scene.audioPath) {
      // audioIncluded도 false이고 audioPath도 없으면 영상만 복사
      if (adjustmentType === 'none') {
        // 이미 복사됨
      }
    }
    // Veo 영상 (audioIncluded=true)은 이미 outputPath에 저장됨
    
    // 최종 길이 확인
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outputPath}"`
    );
    const finalDurationMs = Math.round(parseFloat(stdout.trim()) * 1000);
    
    return {
      sceneId: scene.id,
      originalPath: scene.videoPath!,
      adjustedPath: `/videos/jobs/${this.jobId}/adjusted/${outputFileName}`,
      adjustmentType,
      originalDurationMs: videoDurationMs,
      targetDurationMs: audioDurationMs,
      finalDurationMs,
    };
  }

  /**
   * 영상에 음성 합성 (더빙)
   */
  private async addAudioToVideo(videoPath: string, audioPath: string, outputPath: string): Promise<void> {
    // audioPath가 상대 경로인 경우 절대 경로로 변환
    const fullAudioPath = audioPath.startsWith('/') 
      ? path.join(process.cwd(), 'public', audioPath)
      : audioPath;
    
    // 영상의 기존 오디오를 제거하고 새 음성으로 교체
    // -shortest: 짧은 쪽에 맞춤 (영상이 약간 길면 오디오 끝에서 자름)
    const cmd = `ffmpeg -y -i "${videoPath}" -i "${fullAudioPath}" -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 -shortest "${outputPath}"`;
    
    try {
      await execAsync(cmd);
    } catch (error) {
      console.error(`[VideoManager] 음성 합성 실패:`, error);
      // 실패 시 영상만 복사
      await fs.copyFile(videoPath, outputPath);
    }
  }

  /**
   * 프레임 홀드 효과 (마지막 프레임 정지)
   */
  private async applyFreeze(inputPath: string, outputPath: string, targetDurationMs: number): Promise<void> {
    const targetDurationSec = targetDurationMs / 1000;
    
    // tpad 필터로 마지막 프레임 반복
    const cmd = `ffmpeg -y -i "${inputPath}" -vf "tpad=stop_mode=clone:stop_duration=${targetDurationSec}" -t ${targetDurationSec} -c:a copy "${outputPath}"`;
    await execAsync(cmd);
  }

  /**
   * Ken Burns 효과 (천천히 확대/이동)
   */
  private async applyKenBurns(inputPath: string, outputPath: string, targetDurationMs: number): Promise<void> {
    const targetDurationSec = targetDurationMs / 1000;
    
    // 먼저 영상을 목표 길이로 늘린 후 zoompan 적용
    const tempPath = outputPath.replace('.mp4', '_temp.mp4');
    
    // 1. 영상 속도 느리게 + 프레임 홀드로 길이 맞춤
    const slowCmd = `ffmpeg -y -i "${inputPath}" -vf "setpts=PTS*1.5,tpad=stop_mode=clone:stop_duration=${targetDurationSec}" -t ${targetDurationSec} -r 30 "${tempPath}"`;
    await execAsync(slowCmd);
    
    // 2. zoompan으로 Ken Burns 효과 (천천히 1.0 → 1.1배 확대)
    const kenBurnsCmd = `ffmpeg -y -i "${tempPath}" -vf "zoompan=z='min(zoom+0.0005,1.1)':d=1:s=1080x1920:fps=30" -t ${targetDurationSec} -c:a copy "${outputPath}"`;
    await execAsync(kenBurnsCmd);
    
    // 임시 파일 삭제
    await fs.unlink(tempPath).catch(() => {});
  }

  /**
   * 루프 효과 (영상 반복)
   */
  private async applyLoop(inputPath: string, outputPath: string, targetDurationMs: number): Promise<void> {
    const targetDurationSec = targetDurationMs / 1000;
    
    // stream_loop으로 반복 후 목표 길이로 자르기
    const cmd = `ffmpeg -y -stream_loop -1 -i "${inputPath}" -t ${targetDurationSec} -c:v libx264 -c:a aac "${outputPath}"`;
    await execAsync(cmd);
  }

  /**
   * 트림 (영상 자르기)
   */
  private async applyTrim(inputPath: string, outputPath: string, targetDurationMs: number): Promise<void> {
    const targetDurationSec = targetDurationMs / 1000;
    
    const cmd = `ffmpeg -y -i "${inputPath}" -t ${targetDurationSec} -c:v copy -c:a copy "${outputPath}"`;
    await execAsync(cmd);
  }

  /**
   * 영상 길이 측정
   */
  async getVideoDuration(videoPath: string): Promise<number> {
    const fullPath = videoPath.startsWith('/') 
      ? path.join(process.cwd(), 'public', videoPath)
      : videoPath;
      
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${fullPath}"`
    );
    return Math.round(parseFloat(stdout.trim()) * 1000);
  }
}

// 팩토리 함수
export function createVideoManager(jobId: string): VideoManager {
  return new VideoManager(jobId);
}

