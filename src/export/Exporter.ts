/**
 * Exporter - 최종 렌더링
 * 
 * 역할:
 * 1. 자막 자동 생성 및 동기화
 * 2. BGM 추가 + ducking
 * 3. 최종 mp4 출력
 * 4. timeline.json 및 logs 저장
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import type { Scene, ExportResult, TimelineOptions, SubtitleStyle } from '@/core/types';

const execAsync = promisify(exec);

export class Exporter {
  private jobId: string;
  private outputDir: string;
  private options: TimelineOptions;
  private logs: string[] = [];
  
  constructor(jobId: string, options: TimelineOptions) {
    this.jobId = jobId;
    this.outputDir = path.join(process.cwd(), 'public', 'videos', 'jobs', jobId);
    this.options = options;
  }

  /**
   * 최종 내보내기
   */
  async export(
    composedVideoPath: string,
    fullAudioPath: string,
    scenes: Scene[],
    useEmbeddedAudio: boolean = true  // 각 씬에 이미 더빙된 오디오 사용 여부
  ): Promise<ExportResult> {
    this.log(`[Exporter] 최종 내보내기 시작`);
    
    await fs.mkdir(this.outputDir, { recursive: true });
    
    let currentVideoPath = path.join(process.cwd(), 'public', composedVideoPath);
    const currentAudioPath = path.join(process.cwd(), 'public', fullAudioPath);
    
    // 1. 영상 + 오디오 합성 (useEmbeddedAudio가 false일 때만)
    // 각 씬에 이미 음성이 더빙되어 있으면 이 단계 건너뜀
    if (!useEmbeddedAudio) {
      this.log(`[Exporter] 영상 + 오디오 합성 중...`);
      const videoWithAudioPath = path.join(this.outputDir, 'step1_with_audio.mp4');
      await this.mergeVideoAndAudio(currentVideoPath, currentAudioPath, videoWithAudioPath);
      currentVideoPath = videoWithAudioPath;
    } else {
      this.log(`[Exporter] ✅ 각 씬에 이미 음성이 더빙되어 있어 오디오 합성 단계 건너뜀`);
    }
    
    // 2. 자막 추가 (옵션)
    if (this.options.enableSubtitles) {
      this.log(`[Exporter] 자막 추가 중...`);
      const subtitledPath = path.join(this.outputDir, 'step2_subtitled.mp4');
      await this.addSubtitles(currentVideoPath, scenes, subtitledPath);
      currentVideoPath = subtitledPath;
    }
    
    // 3. BGM 추가 (옵션)
    if (this.options.enableBGM && this.options.bgmPath) {
      this.log(`[Exporter] BGM 추가 중...`);
      const withBgmPath = path.join(this.outputDir, 'step3_with_bgm.mp4');
      await this.addBGM(currentVideoPath, this.options.bgmPath, withBgmPath);
      currentVideoPath = withBgmPath;
    }
    
    // 4. 최종 출력 (9:16, 1080x1920)
    this.log(`[Exporter] 최종 렌더링 중...`);
    const finalPath = path.join(this.outputDir, 'final.mp4');
    await this.finalRender(currentVideoPath, finalPath);
    
    // 5. 타임라인 JSON 저장
    const timelineJsonPath = await this.saveTimelineJson(scenes);
    
    // 6. 로그 저장
    const logPath = await this.saveLogs();
    
    // 7. 파일 크기 확인
    const stats = await fs.stat(finalPath);
    
    // 8. 최종 길이 확인
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${finalPath}"`
    );
    const totalDurationMs = Math.round(parseFloat(stdout.trim()) * 1000);
    
    this.log(`[Exporter] 내보내기 완료: ${finalPath} (${totalDurationMs}ms, ${Math.round(stats.size / 1024 / 1024)}MB)`);
    
    return {
      videoPath: `/videos/jobs/${this.jobId}/final.mp4`,
      timelineJsonPath,
      logPath,
      totalDurationMs,
      fileSize: stats.size,
    };
  }

  /**
   * 영상과 오디오 합성
   */
  private async mergeVideoAndAudio(
    videoPath: string,
    audioPath: string,
    outputPath: string
  ): Promise<void> {
    // 영상의 기존 오디오 제거하고 새 오디오로 교체
    const cmd = `ffmpeg -y -i "${videoPath}" -i "${audioPath}" -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 -shortest "${outputPath}"`;
    await execAsync(cmd);
  }

  /**
   * 자막 추가 (ASS 형식)
   */
  private async addSubtitles(
    videoPath: string,
    scenes: Scene[],
    outputPath: string
  ): Promise<void> {
    // ASS 자막 파일 생성
    const assPath = path.join(this.outputDir, 'subtitles.ass');
    const assContent = this.generateASSSubtitles(scenes);
    await fs.writeFile(assPath, assContent);
    
    // 자막 번인
    const cmd = `ffmpeg -y -i "${videoPath}" -vf "ass=${assPath}" -c:a copy "${outputPath}"`;
    await execAsync(cmd);
  }

  /**
   * ASS 자막 파일 생성
   */
  private generateASSSubtitles(scenes: Scene[]): string {
    const style = this.options.subtitleStyle || {
      fontFamily: 'Pretendard',
      fontSize: 48,
      fontColor: '#FFFFFF',
      backgroundColor: 'rgba(0,0,0,0.6)',
      position: 'bottom',
      animation: 'fade',
    };
    
    // ASS 헤더
    let ass = `[Script Info]
Title: Shorts Subtitles
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${style.fontFamily},${style.fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,3,1,2,50,50,100,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    // 씬별 자막 추가
    for (const scene of scenes) {
      if (!scene.startTimeMs || !scene.endTimeMs) continue;
      
      const startTime = this.msToAssTime(scene.startTimeMs);
      const endTime = this.msToAssTime(scene.endTimeMs);
      
      // 텍스트 정리 (ASS 특수문자 이스케이프)
      const text = scene.text
        .replace(/\n/g, '\\N')
        .replace(/\{/g, '\\{')
        .replace(/\}/g, '\\}');
      
      ass += `Dialogue: 0,${startTime},${endTime},Default,,0,0,0,,${text}\n`;
    }

    return ass;
  }

  /**
   * 밀리초를 ASS 타임코드로 변환 (H:MM:SS.cc)
   */
  private msToAssTime(ms: number): string {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const centiseconds = Math.floor((ms % 1000) / 10);
    
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
  }

  /**
   * BGM 추가 (ducking 포함)
   */
  private async addBGM(
    videoPath: string,
    bgmPath: string,
    outputPath: string
  ): Promise<void> {
    const bgmFullPath = path.join(process.cwd(), 'public', bgmPath);
    const bgmVolume = this.options.bgmVolume;
    
    if (this.options.enableDucking) {
      // sidechaincompress로 ducking 효과
      // 내레이션이 있을 때 BGM 볼륨 자동 감소
      const cmd = `ffmpeg -y -i "${videoPath}" -i "${bgmFullPath}" -filter_complex "[1:a]volume=${bgmVolume}[bgm];[0:a][bgm]sidechaincompress=threshold=0.02:ratio=6:attack=200:release=1000[outa];[0:a][outa]amix=inputs=2:duration=first[finala]" -map 0:v -map "[finala]" -c:v copy -c:a aac "${outputPath}"`;
      await execAsync(cmd);
    } else {
      // 단순 볼륨 믹싱
      const cmd = `ffmpeg -y -i "${videoPath}" -i "${bgmFullPath}" -filter_complex "[1:a]volume=${bgmVolume}[bgm];[0:a][bgm]amix=inputs=2:duration=first[outa]" -map 0:v -map "[outa]" -c:v copy -c:a aac "${outputPath}"`;
      await execAsync(cmd);
    }
  }

  /**
   * 최종 렌더링 (해상도, 프레임레이트 정규화)
   */
  private async finalRender(inputPath: string, outputPath: string): Promise<void> {
    const { width, height } = this.options.resolution;
    const fps = this.options.fps;
    
    // 해상도 및 프레임레이트 정규화
    const cmd = `ffmpeg -y -i "${inputPath}" -vf "scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,fps=${fps}" -c:v libx264 -preset medium -crf 20 -c:a aac -b:a 192k -movflags +faststart "${outputPath}"`;
    await execAsync(cmd);
  }

  /**
   * 타임라인 JSON 저장
   */
  private async saveTimelineJson(scenes: Scene[]): Promise<string> {
    const totalDurationMs = scenes.reduce((sum, s) => sum + s.audioDurationMs, 0);
    
    const timeline = {
      id: this.jobId,
      duration: totalDurationMs,
      scenes: scenes.map(s => ({
        id: s.id,
        text: s.text,
        audio: s.audioPath,
        audioDuration: s.audioDurationMs,
        video: s.adjustedVideoPath || s.videoPath,
        videoHandled: s.videoStatus === 'adjusted' || s.videoStatus === 'completed',
      })),
      exportedAt: new Date().toISOString(),
    };
    
    const jsonPath = path.join(this.outputDir, 'timeline.json');
    await fs.writeFile(jsonPath, JSON.stringify(timeline, null, 2));
    
    return `/videos/jobs/${this.jobId}/timeline.json`;
  }

  /**
   * 로그 저장
   */
  private async saveLogs(): Promise<string> {
    const logPath = path.join(this.outputDir, 'export.log');
    await fs.writeFile(logPath, this.logs.join('\n'));
    return `/videos/jobs/${this.jobId}/export.log`;
  }

  /**
   * 로그 추가
   */
  private log(message: string): void {
    const timestamp = new Date().toISOString();
    this.logs.push(`[${timestamp}] ${message}`);
    console.log(message);
  }
}

// 팩토리 함수
export function createExporter(jobId: string, options: TimelineOptions): Exporter {
  return new Exporter(jobId, options);
}

