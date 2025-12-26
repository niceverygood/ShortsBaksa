/**
 * Job(파이프라인 실행 이력) 관리
 * 
 * 영상 생성 작업의 상태를 저장하고 조회합니다.
 * 현재는 로컬 JSON 파일을 사용하며, 필요시 DB로 마이그레이션할 수 있습니다.
 * 
 * TODO: Prisma + PostgreSQL 또는 Supabase로 마이그레이션 고려
 */

import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { Job, CreateJobInput, UpdateJobInput, JobStatus } from '@/types';

// 데이터 저장 경로
const DATA_DIR = path.join(process.cwd(), 'data');
const JOBS_FILE = path.join(DATA_DIR, 'jobs.json');

/**
 * 데이터 디렉터리가 존재하지 않으면 생성합니다.
 */
async function ensureDataDir(): Promise<void> {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

/**
 * Jobs 파일을 읽어옵니다.
 */
async function readJobsFile(): Promise<Job[]> {
  await ensureDataDir();
  
  try {
    const content = await fs.readFile(JOBS_FILE, 'utf-8');
    return JSON.parse(content) as Job[];
  } catch {
    // 파일이 없거나 파싱 실패 시 빈 배열 반환
    return [];
  }
}

/**
 * Jobs 파일에 데이터를 저장합니다.
 */
async function writeJobsFile(jobs: Job[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(JOBS_FILE, JSON.stringify(jobs, null, 2), 'utf-8');
}

/**
 * 새로운 Job을 생성합니다.
 * 
 * @param input - Job 생성 데이터
 * @returns 생성된 Job
 */
export async function createJob(input: CreateJobInput): Promise<Job> {
  const jobs = await readJobsFile();
  
  const now = new Date().toISOString();
  const newJob: Job = {
    id: uuidv4(),
    topic: input.topic,
    category: input.category || null,
    status: 'script' as JobStatus,
    script: null,
    audioUrl: null,
    videoUrl: null,
    youtubeUrl: null,
    youtubeVideoId: null,
    brewJobId: null,
    autoUpload: input.autoUpload ?? true,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
  };
  
  jobs.unshift(newJob); // 최신 항목을 앞에 추가
  await writeJobsFile(jobs);
  
  return newJob;
}

/**
 * Job 상태를 업데이트합니다.
 * 
 * @param id - Job ID
 * @param updates - 업데이트할 데이터
 * @returns 업데이트된 Job 또는 null
 */
export async function updateJobStatus(id: string, updates: UpdateJobInput): Promise<Job | null> {
  const jobs = await readJobsFile();
  
  const index = jobs.findIndex(job => job.id === id);
  if (index === -1) {
    return null;
  }
  
  const updatedJob: Job = {
    ...jobs[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  
  jobs[index] = updatedJob;
  await writeJobsFile(jobs);
  
  return updatedJob;
}

/**
 * Job을 ID로 조회합니다.
 * 
 * @param id - Job ID
 * @returns Job 또는 null
 */
export async function getJob(id: string): Promise<Job | null> {
  const jobs = await readJobsFile();
  return jobs.find(job => job.id === id) || null;
}

/**
 * Job 목록을 조회합니다.
 * 
 * @param limit - 조회할 최대 개수
 * @param offset - 시작 위치
 * @returns Job 목록과 전체 개수
 */
export async function listJobs(limit = 20, offset = 0): Promise<{ jobs: Job[]; total: number }> {
  const jobs = await readJobsFile();
  
  // 최신순 정렬 (이미 정렬되어 있지만 안전을 위해)
  const sorted = jobs.sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  
  const paged = sorted.slice(offset, offset + limit);
  
  return {
    jobs: paged,
    total: jobs.length,
  };
}

/**
 * 특정 상태의 Job 목록을 조회합니다.
 * 
 * @param status - 조회할 상태
 * @returns 해당 상태의 Job 목록
 */
export async function getJobsByStatus(status: JobStatus): Promise<Job[]> {
  const jobs = await readJobsFile();
  return jobs.filter(job => job.status === status);
}

/**
 * 렌더링 중인 Job 목록을 조회합니다.
 * (Brew 작업 상태 확인을 위해)
 */
export async function getRenderingJobs(): Promise<Job[]> {
  const jobs = await readJobsFile();
  return jobs.filter(job => job.status === 'render' && job.brewJobId);
}

/**
 * Job을 삭제합니다.
 * 
 * @param id - Job ID
 * @returns 삭제 성공 여부
 */
export async function deleteJob(id: string): Promise<boolean> {
  const jobs = await readJobsFile();
  
  const index = jobs.findIndex(job => job.id === id);
  if (index === -1) {
    return false;
  }
  
  jobs.splice(index, 1);
  await writeJobsFile(jobs);
  
  return true;
}

/**
 * 모든 Job을 삭제합니다. (개발/테스트용)
 */
export async function clearAllJobs(): Promise<void> {
  await writeJobsFile([]);
}





