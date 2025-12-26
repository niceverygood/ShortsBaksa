/**
 * 파일 저장소 유틸리티
 * 
 * 오디오 및 비디오 파일을 로컬 파일 시스템에 저장합니다.
 * 실제 프로덕션에서는 S3, Supabase Storage 등으로 교체할 수 있습니다.
 */

import fs from 'fs/promises';
import path from 'path';
import type { SaveFileParams, SaveFileResult } from '@/types';

// 저장 디렉터리 경로
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const AUDIO_DIR = path.join(PUBLIC_DIR, 'audio');
const VIDEO_DIR = path.join(PUBLIC_DIR, 'videos');

/**
 * 디렉터리가 존재하지 않으면 생성합니다.
 */
async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
  }
}

/**
 * 오디오 파일을 저장합니다.
 * 
 * @param params - 저장할 파일 정보
 * @returns 저장된 파일의 URL과 경로
 */
export async function saveAudio(params: SaveFileParams): Promise<SaveFileResult> {
  const { buffer, fileName } = params;
  
  await ensureDir(AUDIO_DIR);
  
  const filePath = path.join(AUDIO_DIR, fileName);
  await fs.writeFile(filePath, buffer);
  
  // 상대 경로 사용 (브라우저에서 현재 도메인 기준으로 접근)
  const url = `/audio/${fileName}`;
  
  return {
    url,
    path: filePath,
  };
}

/**
 * 비디오 파일을 저장합니다.
 * 
 * @param params - 저장할 파일 정보
 * @returns 저장된 파일의 URL과 경로
 */
export async function saveVideo(params: SaveFileParams): Promise<SaveFileResult> {
  const { buffer, fileName } = params;
  
  await ensureDir(VIDEO_DIR);
  
  const filePath = path.join(VIDEO_DIR, fileName);
  await fs.writeFile(filePath, buffer);
  
  // 상대 경로 사용 (브라우저에서 현재 도메인 기준으로 접근)
  const url = `/videos/${fileName}`;
  
  return {
    url,
    path: filePath,
  };
}

/**
 * URL에서 파일을 다운로드하여 Buffer로 반환합니다.
 * 
 * @param url - 다운로드할 파일 URL
 * @returns 파일 Buffer
 */
export async function downloadFile(url: string): Promise<Buffer> {
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`파일 다운로드 실패: ${response.status} ${response.statusText}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * 임시 파일을 저장하고 경로를 반환합니다.
 * 
 * @param buffer - 저장할 파일 버퍼
 * @param fileName - 파일명
 * @returns 저장된 파일 경로
 */
export async function saveTempFile(buffer: Buffer, fileName: string): Promise<string> {
  const tmpDir = path.join(process.cwd(), 'tmp');
  await ensureDir(tmpDir);
  
  const filePath = path.join(tmpDir, fileName);
  await fs.writeFile(filePath, buffer);
  
  return filePath;
}

/**
 * 파일을 삭제합니다.
 * 
 * @param filePath - 삭제할 파일 경로
 */
export async function deleteFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    // 파일이 없는 경우 무시
    console.warn(`파일 삭제 실패 (무시됨): ${filePath}`, error);
  }
}

/**
 * 파일이 존재하는지 확인합니다.
 * 
 * @param filePath - 확인할 파일 경로
 * @returns 파일 존재 여부
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}




