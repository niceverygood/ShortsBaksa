/**
 * 쇼츠 자동생성 시스템 - 핵심 타입 정의
 * 
 * 구조: 스크립트 → 음성 → 씬 → 영상 → 타임라인 → 내보내기
 */

// ============================================
// 기본 단위
// ============================================

/** 씬(Scene) - 하나의 문장/장면 단위 */
export interface Scene {
  id: number;
  text: string;                    // 해당 씬의 대사/문장
  prompt?: string;                 // AI 영상 생성 프롬프트
  
  // 오디오 정보
  audioPath?: string;              // 분할된 음성 파일 경로
  audioDurationMs: number;         // 음성 길이 (밀리초)
  audioIncluded?: boolean;         // 영상에 음성이 이미 포함됨 (Veo 3의 경우 true)
  
  // 영상 정보
  videoPath?: string;              // 생성된 영상 파일 경로
  videoDurationMs?: number;        // 영상 길이 (밀리초)
  videoStatus: 'pending' | 'generating' | 'completed' | 'failed' | 'adjusted';
  
  // 보정 정보
  adjustmentType?: 'none' | 'loop' | 'freeze' | 'trim' | 'ken_burns';
  adjustedVideoPath?: string;      // 보정된 영상 경로
  
  // 메타데이터
  startTimeMs?: number;            // 타임라인에서의 시작 시간
  endTimeMs?: number;              // 타임라인에서의 종료 시간
  errorMessage?: string;
}

/** 타임라인 JSON 구조 */
export interface Timeline {
  id: string;                      // 작업 ID
  topic: string;                   // 영상 주제
  category?: string;
  
  totalDurationMs: number;         // 총 길이 (밀리초)
  targetDurationMs: number;        // 목표 길이 (30000 or 60000)
  
  scenes: Scene[];
  
  // 전체 파일 경로
  fullAudioPath?: string;          // 전체 음성 파일
  fullVideoPath?: string;          // 최종 영상 파일
  timelineJsonPath?: string;       // 타임라인 JSON 파일
  
  // 상태
  status: TimelineStatus;
  currentStep: PipelineStep;
  
  // 옵션
  options: TimelineOptions;
  
  // 타임스탬프
  createdAt: string;
  updatedAt: string;
}

export type TimelineStatus = 
  | 'created'
  | 'script_generating'
  | 'script_completed'
  | 'audio_generating'
  | 'audio_completed'
  | 'scenes_generating'
  | 'scenes_completed'
  | 'video_adjusting'
  | 'video_adjusted'
  | 'composing'
  | 'exporting'
  | 'completed'
  | 'failed';

export type PipelineStep = 
  | 'script'
  | 'audio'
  | 'scenes'
  | 'video'
  | 'timeline'
  | 'export';

export interface TimelineOptions {
  // AI 선택
  scriptAI: 'claude' | 'gpt-5' | 'gemini';
  videoAI: 'veo' | 'higgsfield';
  
  /**
   * Higgsfield 플랫폼에서 사용할 AI 모델
   * - 'seedance-1.5': ByteDance Seedance 1.5 Pro
   * - 'kling-2.6': Kuaishou Kling 2.6
   * - 'wan-2.6': Alibaba Wan 2.6
   * - 'minimax-hailuo': MiniMax Hailuo
   */
  higgsfieldModel?: 'seedance-1.5' | 'kling-2.6' | 'wan-2.6' | 'minimax-hailuo';
  
  /**
   * 영상 생성 모드:
   * - 'text-to-video-with-audio': Veo 3 전용 - 텍스트로 영상+음성 동시 생성 (TTS 별도 불필요)
   * - 'video-then-audio': Higgsfield 등 - 영상 생성 후 음성 합성 (TTS 필요)
   */
  videoGenerationMode: 'text-to-video-with-audio' | 'video-then-audio';
  
  // 영상 설정
  resolution: { width: number; height: number };
  aspectRatio: '9:16' | '16:9';
  fps: number;
  
  // 전환 효과
  transitionPreset: 'smash_cut' | 'whip_pan' | 'scale_in' | 'fade' | 'none';
  transitionDurationMs: number;
  
  // 자막
  enableSubtitles: boolean;
  subtitleStyle?: SubtitleStyle;
  
  // BGM
  enableBGM: boolean;
  bgmPath?: string;
  bgmVolume: number;      // 0.0 ~ 1.0
  enableDucking: boolean; // 내레이션 시 BGM 볼륨 낮추기
}

export interface SubtitleStyle {
  fontFamily: string;
  fontSize: number;
  fontColor: string;
  backgroundColor?: string;
  position: 'top' | 'center' | 'bottom';
  animation: 'none' | 'fade' | 'typewriter' | 'highlight';
}

// ============================================
// 매니저 인터페이스
// ============================================

/** 스크립트 생성 결과 */
export interface ScriptResult {
  fullScript: string;
  sentences: string[];
  estimatedDurationMs: number;
}

/** 오디오 생성 결과 */
export interface AudioResult {
  fullAudioPath: string;
  fullAudioDurationMs: number;
  segments: AudioSegment[];
}

export interface AudioSegment {
  index: number;
  text: string;
  audioPath: string;
  durationMs: number;
  startTimeMs: number;
  endTimeMs: number;
}

/** 씬 생성 결과 */
export interface SceneGenerationResult {
  sceneId: number;
  videoPath: string;
  videoDurationMs: number;
  status: 'completed' | 'failed';
  errorMessage?: string;
}

/** 영상 보정 결과 */
export interface VideoAdjustmentResult {
  sceneId: number;
  originalPath: string;
  adjustedPath: string;
  adjustmentType: 'loop' | 'freeze' | 'trim' | 'ken_burns' | 'none';
  originalDurationMs: number;
  targetDurationMs: number;
  finalDurationMs: number;
}

/** 타임라인 조립 결과 */
export interface CompositionResult {
  outputPath: string;
  totalDurationMs: number;
  scenesIncluded: number;
}

/** 내보내기 결과 */
export interface ExportResult {
  videoPath: string;
  timelineJsonPath: string;
  logPath: string;
  totalDurationMs: number;
  fileSize: number;
}

// ============================================
// API 요청/응답
// ============================================

export interface CreateTimelineRequest {
  topic: string;
  category?: string;
  targetDuration: 30 | 60;
  options?: Partial<TimelineOptions>;
}

export interface TimelineResponse {
  success: boolean;
  timeline?: Timeline;
  error?: string;
}

export interface SceneStatusResponse {
  success: boolean;
  scenes: Scene[];
  completedCount: number;
  failedCount: number;
  pendingCount: number;
}

// ============================================
// 기본값
// ============================================

export const DEFAULT_TIMELINE_OPTIONS: TimelineOptions = {
  scriptAI: 'claude',
  videoAI: 'veo',
  videoGenerationMode: 'text-to-video-with-audio', // Veo 기본값
  resolution: { width: 1080, height: 1920 },
  aspectRatio: '9:16',
  fps: 30,
  transitionPreset: 'smash_cut',
  transitionDurationMs: 200,
  enableSubtitles: true,
  subtitleStyle: {
    fontFamily: 'Pretendard',
    fontSize: 48,
    fontColor: '#FFFFFF',
    backgroundColor: 'rgba(0,0,0,0.6)',
    position: 'bottom',
    animation: 'fade',
  },
  enableBGM: false,
  bgmVolume: 0.3,
  enableDucking: true,
};

// ============================================
// 상수
// ============================================

export const SCENE_DURATION_LIMITS = {
  MIN_MS: 4000,   // Veo 최소 4초
  MAX_MS: 8000,   // Veo 최대 8초
  TARGET_MS: 6000, // 목표 6초
};

export const VIDEO_SPECS = {
  WIDTH: 1080,
  HEIGHT: 1920,
  FPS: 30,
  ASPECT_RATIO: '9:16',
};

export const CHARS_PER_SECOND_KO = 4.5; // 한국어 TTS 기준 초당 글자 수

