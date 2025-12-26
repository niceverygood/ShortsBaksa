/**
 * YouTube Shorts 자동 생성 서비스 타입 정의
 */

// ==============================================
// Job 관련 타입
// ==============================================

export type JobStatus = 
  | 'script'      // 스크립트 생성 중
  | 'audio'       // 오디오(TTS) 생성 중
  | 'prompts'     // 영상 프롬프트 생성 중
  | 'render'      // 영상 렌더링 중
  | 'merge'       // 영상 합치기 중
  | 'upload'      // 유튜브 업로드 중
  | 'completed'   // 완료
  | 'failed';     // 실패

// 멀티클립 작업 단계
export interface MultiClipStep {
  id: string;
  name: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  startTime?: string;
  endTime?: string;
  result?: any;
  error?: string;
}

// 멀티클립 클립 정보
export interface ClipInfo {
  index: number;
  scriptSection: string;      // 해당 클립의 스크립트
  prompt: string;             // AI가 생성한 영상 프롬프트
  duration: number;           // 클립 길이 (초)
  status: 'pending' | 'processing' | 'completed' | 'failed';
  jobId?: string;             // AI 서비스별 Job ID (veo|... 또는 higgsfield Job ID)
  videoUrl?: string;          // 생성된 영상 URL
  audioUrl?: string;          // 세그먼트 오디오 URL
}

export interface Job {
  id: string;
  topic: string;
  category: string | null;
  status: JobStatus;
  script: string | null;
  audioUrl: string | null;
  videoUrl: string | null;
  youtubeUrl: string | null;
  youtubeVideoId: string | null;
  brewJobId: string | null;
  autoUpload: boolean;
  errorMessage: string | null;
  videoProvider?: VideoProvider;
  aiProvider?: AIProvider;
  veoModel?: VeoModel;
  veoDuration?: number;
  higgsfieldModel?: HiggsfieldModel;
  klingDuration?: '5' | '10';
  useMultiClip?: boolean;       // 멀티클립 모드 여부
  targetDuration?: number;      // 목표 영상 길이
  clipProgress?: string;        // 멀티클립 진행 상황 (예: "3/6")
  clipUrls?: string[];          // 개별 클립 URL 목록
  // 멀티클립 상세 정보
  steps?: MultiClipStep[];      // 작업 단계별 상태
  clips?: ClipInfo[];           // 개별 클립 정보
  audioDuration?: number;       // 오디오 총 길이 (초)
  createdAt: string;
  updatedAt: string;
}

export interface CreateJobInput {
  topic: string;
  category?: string;
  autoUpload?: boolean;
}

export interface UpdateJobInput {
  status?: JobStatus;
  script?: string;
  audioUrl?: string;
  videoUrl?: string;
  youtubeUrl?: string;
  youtubeVideoId?: string;
  brewJobId?: string;
  errorMessage?: string;
  clipProgress?: string;
  clipUrls?: string[];
  steps?: MultiClipStep[];
  clips?: ClipInfo[];
  audioDuration?: number;
  videoProvider?: VideoProvider;
}

// ==============================================
// LLM 관련 타입
// ==============================================

export interface GenerateScriptOptions {
  topic: string;
  category?: string;
}

// ==============================================
// ElevenLabs 관련 타입
// ==============================================

export interface GenerateTTSParams {
  script: string;
  voiceId?: string;
}

export interface TTSResult {
  audioBuffer: Buffer;
  fileName: string;
}

// ==============================================
// Storage 관련 타입
// ==============================================

export interface SaveFileParams {
  buffer: Buffer;
  fileName: string;
}

export interface SaveFileResult {
  url: string;
  path: string;
}

// ==============================================
// Brew 관련 타입
// ==============================================

export type AspectRatio = '9:16' | '16:9';

export interface RequestBrewVideoParams {
  script: string;
  audioUrl: string;
  aspectRatio?: AspectRatio;
}

export interface BrewJobResult {
  jobId: string;
}

export type BrewVideoStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface BrewVideoResult {
  status: BrewVideoStatus;
  videoUrl?: string;
  errorMessage?: string;
}

// ==============================================
// YouTube 관련 타입
// ==============================================

export type PrivacyStatus = 'public' | 'unlisted' | 'private';

export interface UploadToYoutubeParams {
  videoPathOrUrl: string;
  title: string;
  description?: string;
  tags?: string[];
  privacyStatus?: PrivacyStatus;
}

export interface YouTubeUploadResult {
  youtubeUrl: string;
  youtubeVideoId: string;
}

// ==============================================
// API 요청/응답 타입
// ==============================================

export type VideoProvider = 'runway' | 'google' | 'kling' | 'veo' | 'higgsfield';
export type AIProvider = 'openrouter' | 'google' | 'openai';

// Veo 모델 선택
export type VeoModel = 'veo-3' | 'veo-3-fast' | 'veo-3.1';

// Higgsfield 모델 선택
export type HiggsfieldModel = 'veo-3.1' | 'sora-2' | 'kling-2.6' | 'wan-2.6' | 'minimax-hailuo' | 'seedance-1.5';

export interface PipelineRequest {
  topic: string;
  category?: string;
  voiceId?: string;
  autoUpload?: boolean;
  videoProvider?: VideoProvider;
  aiProvider?: AIProvider;  // AI 제공자 선택 (기본: openrouter)
  veoModel?: VeoModel;      // Veo 모델 선택
  veoDuration?: number;     // Veo 영상 길이 (4-8초)
  veoWithAudio?: boolean;   // Veo 음성 포함 모드
  higgsfieldModel?: HiggsfieldModel;  // Higgsfield 모델 선택
  klingDuration?: '5' | '10';         // Kling 영상 길이
  useMultiClip?: boolean;   // 멀티클립 모드 (긴 영상)
  targetDuration?: number;  // 목표 영상 길이 (멀티클립용)
}

export interface PipelineResponse {
  success: boolean;
  job: Job;
  message: string;
}

export interface CheckAndUploadRequest {
  jobId: string;
}

export interface CheckAndUploadResponse {
  success: boolean;
  job: Job;
  message: string;
  clipsReady?: boolean; // 모든 클립 렌더링 완료 여부 (수동 합치기 대기)
}

export interface JobsListResponse {
  success: boolean;
  jobs: Job[];
  total: number;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  details?: string;
}

// ==============================================
// 카테고리 상수
// ==============================================

export const CATEGORIES = [
  { value: 'health', label: '건강/의료' },
  { value: 'finance', label: '재테크/금융' },
  { value: 'healing', label: '힐링/마음건강' },
  { value: 'lifestyle', label: '라이프스타일' },
  { value: 'hobby', label: '취미/여가' },
  { value: 'travel', label: '여행' },
  { value: 'food', label: '요리/음식' },
  { value: 'culture', label: '문화/역사' },
  { value: 'tech', label: '디지털/IT' },
  { value: 'etc', label: '기타' },
] as const;

export type CategoryValue = typeof CATEGORIES[number]['value'];

