/**
 * FFmpeg를 이용한 영상 합성
 * 
 * 이미지들과 오디오를 합성하여 영상을 생성합니다.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

/**
 * FFmpeg가 설치되어 있는지 확인합니다.
 */
export async function checkFFmpegInstalled(): Promise<boolean> {
  try {
    await execAsync('ffmpeg -version');
    return true;
  } catch {
    return false;
  }
}

/**
 * 오디오 파일의 길이(초)를 가져옵니다.
 */
export async function getAudioDuration(audioPath: string): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`
    );
    return parseFloat(stdout.trim());
  } catch (error) {
    console.error('오디오 길이 확인 실패:', error);
    return 60; // 기본값 60초
  }
}

/**
 * 오디오 파일을 지정된 시간 구간으로 분할합니다.
 * 
 * @param audioPath - 원본 오디오 파일 경로
 * @param startTime - 시작 시간 (초)
 * @param duration - 길이 (초)
 * @param outputPath - 출력 파일 경로
 */
export async function splitAudio(
  audioPath: string,
  startTime: number,
  duration: number,
  outputPath: string
): Promise<void> {
  const cmd = `ffmpeg -y -i "${audioPath}" -ss ${startTime.toFixed(3)} -t ${duration.toFixed(3)} -c copy "${outputPath}"`;
  
  try {
    await execAsync(cmd);
    console.log(`[FFmpeg] 오디오 분할 완료: ${outputPath}`);
  } catch (error) {
    console.error('[FFmpeg] 오디오 분할 실패:', error);
    throw error;
  }
}

/**
 * 오디오 속도를 조절합니다 (길이 변경)
 * 
 * @param inputPath - 입력 오디오 파일 경로
 * @param outputPath - 출력 오디오 파일 경로
 * @param targetDuration - 목표 길이 (초)
 * @returns 실제 출력 파일의 길이
 */
export async function adjustAudioSpeed(
  inputPath: string,
  outputPath: string,
  targetDuration: number
): Promise<number> {
  // 원본 길이 확인
  const originalDuration = await getAudioDuration(inputPath);
  
  // 속도 비율 계산 (원본/목표 = 속도)
  // 예: 5초 -> 8초 = 0.625배 속도 (느려짐)
  // 예: 8초 -> 5초 = 1.6배 속도 (빨라짐)
  const speedRatio = originalDuration / targetDuration;
  
  // atempo 필터는 0.5 ~ 2.0 범위만 지원
  // 범위를 벗어나면 여러 번 적용
  let atempoFilters: string[] = [];
  let ratio = speedRatio;
  
  while (ratio > 2.0) {
    atempoFilters.push('atempo=2.0');
    ratio /= 2.0;
  }
  while (ratio < 0.5) {
    atempoFilters.push('atempo=0.5');
    ratio /= 0.5;
  }
  atempoFilters.push(`atempo=${ratio.toFixed(4)}`);
  
  const filterStr = atempoFilters.join(',');
  const cmd = `ffmpeg -y -i "${inputPath}" -filter:a "${filterStr}" "${outputPath}"`;
  
  try {
    await execAsync(cmd);
    const newDuration = await getAudioDuration(outputPath);
    console.log(`[FFmpeg] 오디오 속도 조절: ${originalDuration.toFixed(2)}초 → ${newDuration.toFixed(2)}초 (목표: ${targetDuration}초)`);
    return newDuration;
  } catch (error) {
    console.error('[FFmpeg] 오디오 속도 조절 실패:', error);
    throw error;
  }
}

/**
 * 여러 오디오 파일을 하나로 합칩니다.
 * 
 * @param audioPaths - 입력 오디오 파일 경로 배열
 * @param outputPath - 출력 오디오 파일 경로
 */
export async function mergeAudios(
  audioPaths: string[],
  outputPath: string
): Promise<number> {
  if (audioPaths.length === 0) {
    throw new Error('합칠 오디오 파일이 없습니다');
  }

  if (audioPaths.length === 1) {
    // 하나뿐이면 복사
    await fs.copyFile(audioPaths[0], outputPath);
    return getAudioDuration(outputPath);
  }

  // 파일 리스트 생성
  const listDir = path.dirname(outputPath);
  const listPath = path.join(listDir, `merge_list_${Date.now()}.txt`);
  const listContent = audioPaths.map(p => `file '${p}'`).join('\n');
  await fs.writeFile(listPath, listContent);

  const cmd = `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c:a libmp3lame -q:a 2 "${outputPath}"`;
  
  try {
    await execAsync(cmd);
    await fs.unlink(listPath); // 임시 파일 삭제
    const duration = await getAudioDuration(outputPath);
    console.log(`[FFmpeg] ${audioPaths.length}개 오디오 합침: ${duration.toFixed(2)}초`);
    return duration;
  } catch (error) {
    console.error('[FFmpeg] 오디오 합치기 실패:', error);
    await fs.unlink(listPath).catch(() => {});
    throw error;
  }
}

/**
 * 이미지들과 오디오를 합성하여 영상을 생성합니다.
 * 
 * @param imagePaths - 이미지 파일 경로 배열
 * @param audioPath - 오디오 파일 경로
 * @param outputPath - 출력 영상 파일 경로
 * @param options - 추가 옵션
 */
export async function createVideoFromImages(
  imagePaths: string[],
  audioPath: string,
  outputPath: string,
  options: {
    width?: number;
    height?: number;
    fps?: number;
    transition?: 'fade' | 'none';
  } = {}
): Promise<void> {
  const {
    width = 720,
    height = 1280,
    fps = 30,
    transition = 'fade',
  } = options;

  // FFmpeg 설치 확인
  const isInstalled = await checkFFmpegInstalled();
  if (!isInstalled) {
    throw new Error('FFmpeg가 설치되어 있지 않습니다. brew install ffmpeg 명령으로 설치하세요.');
  }

  // 오디오 길이 확인
  const audioDuration = await getAudioDuration(audioPath);
  
  // 각 이미지당 표시 시간 계산
  const imageDuration = audioDuration / imagePaths.length;
  
  // 임시 디렉터리 생성
  const tmpDir = path.join(path.dirname(outputPath), 'tmp_ffmpeg');
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    // 이미지 목록 파일 생성
    const listContent = imagePaths
      .map(imgPath => `file '${imgPath}'\nduration ${imageDuration}`)
      .join('\n');
    
    // 마지막 이미지 추가 (FFmpeg concat 특성상 필요)
    const listWithLast = listContent + `\nfile '${imagePaths[imagePaths.length - 1]}'`;
    
    const listFile = path.join(tmpDir, 'images.txt');
    await fs.writeFile(listFile, listWithLast);

    // FFmpeg 명령 구성
    let ffmpegCmd: string;

    if (transition === 'fade') {
      // 페이드 전환 효과가 있는 영상 생성
      // 복잡한 필터 대신 간단한 방식 사용
      ffmpegCmd = `ffmpeg -y -f concat -safe 0 -i "${listFile}" -i "${audioPath}" \
        -vf "scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps},format=yuv420p" \
        -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p \
        -c:a aac -b:a 128k \
        -shortest \
        -movflags +faststart \
        "${outputPath}"`;
    } else {
      // 전환 효과 없는 간단한 영상 생성
      ffmpegCmd = `ffmpeg -y -f concat -safe 0 -i "${listFile}" -i "${audioPath}" \
        -vf "scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps},format=yuv420p" \
        -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p \
        -c:a aac -b:a 128k \
        -shortest \
        -movflags +faststart \
        "${outputPath}"`;
    }

    console.log('[FFmpeg] 영상 합성 시작...');
    const { stderr } = await execAsync(ffmpegCmd, { maxBuffer: 50 * 1024 * 1024 });
    
    if (stderr && !stderr.includes('Error')) {
      console.log('[FFmpeg] 합성 완료');
    }

    // 출력 파일 확인
    const stats = await fs.stat(outputPath);
    if (stats.size === 0) {
      throw new Error('생성된 영상 파일이 비어있습니다.');
    }

    console.log(`[FFmpeg] 영상 생성 완료: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);

  } finally {
    // 임시 파일 정리
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // 무시
    }
  }
}

/**
 * 단일 이미지와 오디오로 영상을 생성합니다.
 */
export async function createVideoFromSingleImage(
  imagePath: string,
  audioPath: string,
  outputPath: string,
  options: {
    width?: number;
    height?: number;
  } = {}
): Promise<void> {
  const { width = 720, height = 1280 } = options;

  const isInstalled = await checkFFmpegInstalled();
  if (!isInstalled) {
    throw new Error('FFmpeg가 설치되어 있지 않습니다.');
  }

  const audioDuration = await getAudioDuration(audioPath);

  const ffmpegCmd = `ffmpeg -y -loop 1 -i "${imagePath}" -i "${audioPath}" \
    -vf "scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1" \
    -c:v libx264 -preset medium -crf 23 \
    -c:a aac -b:a 128k \
    -t ${audioDuration} \
    -shortest \
    -movflags +faststart \
    "${outputPath}"`;

  console.log('[FFmpeg] 단일 이미지 영상 생성 시작...');
  await execAsync(ffmpegCmd, { maxBuffer: 50 * 1024 * 1024 });
  console.log('[FFmpeg] 영상 생성 완료');
}

/**
 * 영상과 오디오를 합칩니다.
 * Higgsfield 영상 + ElevenLabs 음성 합성용
 */
export async function mergeVideoAndAudio(
  videoPath: string,
  audioPath: string,
  outputPath: string
): Promise<void> {
  const isInstalled = await checkFFmpegInstalled();
  if (!isInstalled) {
    throw new Error('FFmpeg가 설치되어 있지 않습니다.');
  }

  console.log('[FFmpeg] 영상 + 오디오 합성 시작...');
  console.log(`[FFmpeg] 영상: ${videoPath}`);
  console.log(`[FFmpeg] 오디오: ${audioPath}`);

  // 영상의 오디오를 제거하고 새 오디오를 합성
  // -map 0:v: 영상만 가져오기
  // -map 1:a: 오디오만 가져오기
  // -c:v copy: 영상 재인코딩 없이 복사
  // -shortest: 짧은 쪽에 맞춤
  const ffmpegCmd = `ffmpeg -y -i "${videoPath}" -i "${audioPath}" \
    -map 0:v -map 1:a \
    -c:v copy \
    -c:a aac -b:a 192k \
    -shortest \
    -movflags +faststart \
    "${outputPath}"`;

  try {
    await execAsync(ffmpegCmd, { maxBuffer: 100 * 1024 * 1024 });
    
    const stats = await fs.stat(outputPath);
    console.log(`[FFmpeg] 합성 완료: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);
  } catch (error) {
    console.error('[FFmpeg] 합성 실패:', error);
    throw new Error(`영상 합성 실패: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 비디오 파일의 길이(초)를 가져옵니다.
 */
export async function getVideoDuration(videoPath: string): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`
    );
    return parseFloat(stdout.trim());
  } catch (error) {
    console.error('비디오 길이 확인 실패:', error);
    return 0;
  }
}

/**
 * 비디오의 마지막 프레임을 추출하여 정지 영상을 생성합니다.
 */
export async function createFillerFromLastFrame(
  sourceVideoPath: string,
  outputPath: string,
  duration: number
): Promise<void> {
  const isInstalled = await checkFFmpegInstalled();
  if (!isInstalled) {
    throw new Error('FFmpeg가 설치되어 있지 않습니다.');
  }

  console.log(`[FFmpeg] 마지막 프레임으로 ${duration}초 filler 영상 생성...`);

  // 마지막 프레임을 추출하여 지정된 시간만큼 정지 영상 생성
  // -sseof -0.1: 끝에서 0.1초 전 위치로 이동
  // -loop 1: 이미지를 반복
  // -t duration: 지정된 시간만큼
  const ffmpegCmd = `ffmpeg -y -sseof -0.1 -i "${sourceVideoPath}" -vframes 1 -f image2pipe - | \
    ffmpeg -y -loop 1 -i pipe:0 -t ${duration} \
    -vf "fps=30" \
    -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p \
    -an \
    -movflags +faststart \
    "${outputPath}"`;

  try {
    await execAsync(ffmpegCmd, { maxBuffer: 100 * 1024 * 1024, shell: '/bin/bash' });
    console.log(`[FFmpeg] Filler 영상 생성 완료: ${outputPath}`);
  } catch (error) {
    // 파이프 방식이 실패하면 2단계로 시도
    console.log('[FFmpeg] 파이프 방식 실패, 2단계 방식으로 재시도...');
    
    const tmpFrame = outputPath.replace('.mp4', '_frame.png');
    
    // 1단계: 마지막 프레임 추출
    await execAsync(`ffmpeg -y -sseof -0.1 -i "${sourceVideoPath}" -vframes 1 "${tmpFrame}"`, 
      { maxBuffer: 50 * 1024 * 1024 });
    
    // 2단계: 정지 영상 생성
    await execAsync(`ffmpeg -y -loop 1 -i "${tmpFrame}" -t ${duration} \
      -vf "fps=30" \
      -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p \
      -an \
      -movflags +faststart \
      "${outputPath}"`, { maxBuffer: 50 * 1024 * 1024 });
    
    // 임시 파일 삭제
    try { await fs.unlink(tmpFrame); } catch { /* ignore */ }
    
    console.log(`[FFmpeg] Filler 영상 생성 완료 (2단계): ${outputPath}`);
  }
}

/**
 * 여러 비디오 클립을 하나로 합칩니다.
 * 멀티 클립 영상 생성용
 */
export async function mergeVideos(
  videoPaths: string[],
  outputPath: string,
  audioPath?: string
): Promise<void> {
  if (videoPaths.length === 0) {
    throw new Error('합칠 비디오가 없습니다.');
  }

  const isInstalled = await checkFFmpegInstalled();
  if (!isInstalled) {
    throw new Error('FFmpeg가 설치되어 있지 않습니다.');
  }

  console.log(`[FFmpeg] ${videoPaths.length}개 클립 합치기 시작...`);

  // 임시 파일 목록 생성
  const tmpDir = path.join(path.dirname(outputPath), 'tmp_merge');
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    // 클립 목록 파일 생성
    const listContent = videoPaths.map(p => `file '${p}'`).join('\n');
    const listFile = path.join(tmpDir, 'clips.txt');
    await fs.writeFile(listFile, listContent);

    let ffmpegCmd: string;

    if (audioPath) {
      // 오디오와 함께 합치기
      ffmpegCmd = `ffmpeg -y -f concat -safe 0 -i "${listFile}" -i "${audioPath}" \
        -map 0:v -map 1:a \
        -c:v libx264 -preset medium -crf 23 \
        -c:a aac -b:a 192k \
        -shortest \
        -movflags +faststart \
        "${outputPath}"`;
    } else {
      // 비디오만 합치기
      ffmpegCmd = `ffmpeg -y -f concat -safe 0 -i "${listFile}" \
        -c:v libx264 -preset medium -crf 23 \
        -c:a aac -b:a 192k \
        -movflags +faststart \
        "${outputPath}"`;
    }

    await execAsync(ffmpegCmd, { maxBuffer: 100 * 1024 * 1024 });

    const stats = await fs.stat(outputPath);
    console.log(`[FFmpeg] 클립 합치기 완료: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);

  } finally {
    // 임시 파일 정리
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // 무시
    }
  }
}

/**
 * 여러 비디오 클립을 오디오 길이에 맞춰 합칩니다.
 * 영상이 오디오보다 짧으면 마지막 클립의 마지막 프레임을 연장합니다.
 * 
 * @param videoPaths - 비디오 파일 경로 배열
 * @param audioPath - 오디오 파일 경로
 * @param outputPath - 출력 파일 경로
 * @returns 합성된 영상 경로
 */
export async function mergeVideosWithAudioSync(
  videoPaths: string[],
  audioPath: string,
  outputPath: string
): Promise<string> {
  if (videoPaths.length === 0) {
    throw new Error('합칠 비디오가 없습니다.');
  }

  const isInstalled = await checkFFmpegInstalled();
  if (!isInstalled) {
    throw new Error('FFmpeg가 설치되어 있지 않습니다.');
  }

  console.log(`[FFmpeg] 오디오 동기화 합성 시작 (${videoPaths.length}개 클립)...`);

  // 오디오 길이 확인
  const audioDuration = await getAudioDuration(audioPath);
  console.log(`[FFmpeg] 오디오 길이: ${audioDuration.toFixed(2)}초`);

  // 모든 비디오 클립의 총 길이 계산
  let totalVideoDuration = 0;
  for (const videoPath of videoPaths) {
    const duration = await getVideoDuration(videoPath);
    totalVideoDuration += duration;
  }
  console.log(`[FFmpeg] 영상 총 길이: ${totalVideoDuration.toFixed(2)}초`);

  const tmpDir = path.join(path.dirname(outputPath), 'tmp_sync_merge');
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    const finalVideoPaths = [...videoPaths];

    // 영상이 오디오보다 짧으면 마지막 프레임으로 filler 추가
    if (totalVideoDuration < audioDuration - 0.5) {
      const shortfall = audioDuration - totalVideoDuration + 1; // 1초 여유
      console.log(`[FFmpeg] 영상이 ${shortfall.toFixed(2)}초 부족, filler 생성...`);
      
      const lastVideoPath = videoPaths[videoPaths.length - 1];
      const fillerPath = path.join(tmpDir, 'filler.mp4');
      
      await createFillerFromLastFrame(lastVideoPath, fillerPath, shortfall);
      finalVideoPaths.push(fillerPath);
    }

    // 클립 목록 파일 생성
    const listContent = finalVideoPaths.map(p => `file '${p}'`).join('\n');
    const listFile = path.join(tmpDir, 'clips.txt');
    await fs.writeFile(listFile, listContent);

    // 영상 합치기 (오디오 기준으로 길이 맞춤)
    // -shortest 대신 오디오 길이(-t)로 제한하여 영상이 잘리지 않고 오디오 끝까지 유지
    const ffmpegCmd = `ffmpeg -y -f concat -safe 0 -i "${listFile}" -i "${audioPath}" \
      -map 0:v -map 1:a \
      -c:v libx264 -preset medium -crf 23 \
      -c:a aac -b:a 192k \
      -t ${audioDuration} \
      -movflags +faststart \
      "${outputPath}"`;

    await execAsync(ffmpegCmd, { maxBuffer: 100 * 1024 * 1024 });

    const stats = await fs.stat(outputPath);
    console.log(`[FFmpeg] 오디오 동기화 합성 완료: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);

    return outputPath;

  } finally {
    // 임시 파일 정리
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // 무시
    }
  }
}

/**
 * 오디오만 있는 영상 생성 (배경색 사용)
 */
export async function createVideoWithBackground(
  audioPath: string,
  outputPath: string,
  options: {
    width?: number;
    height?: number;
    backgroundColor?: string;
  } = {}
): Promise<void> {
  const { 
    width = 720, 
    height = 1280, 
    backgroundColor = '#F5F0E6' // 따뜻한 베이지색
  } = options;

  const isInstalled = await checkFFmpegInstalled();
  if (!isInstalled) {
    throw new Error('FFmpeg가 설치되어 있지 않습니다.');
  }

  const audioDuration = await getAudioDuration(audioPath);

  const ffmpegCmd = `ffmpeg -y -f lavfi -i color=c=${backgroundColor}:s=${width}x${height}:d=${audioDuration} \
    -i "${audioPath}" \
    -c:v libx264 -preset medium -crf 23 \
    -c:a aac -b:a 128k \
    -shortest \
    -movflags +faststart \
    "${outputPath}"`;

  console.log('[FFmpeg] 배경 영상 생성 시작...');
  await execAsync(ffmpegCmd, { maxBuffer: 50 * 1024 * 1024 });
  console.log('[FFmpeg] 영상 생성 완료');
}

