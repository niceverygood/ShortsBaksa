'use client';

import { useState, useCallback, useRef, useEffect, memo } from 'react';

// ============================================
// Types
// ============================================

interface Scene {
  id: number;
  text: string;
  prompt?: string;
  audioPath?: string;
  audioDurationMs: number;
  videoPath?: string;
  videoDurationMs?: number;
  videoStatus: 'pending' | 'generating' | 'completed' | 'failed' | 'adjusted';
  adjustmentType?: string;
  adjustedVideoPath?: string;
  errorMessage?: string;
  startTimeMs?: number;
  endTimeMs?: number;
}

interface TimelineState {
  id: string;
    topic: string;
  status: string;
  currentStep: string;
  scenes: Scene[];
  totalDurationMs?: number;
  fullAudioPath?: string;
  fullVideoPath?: string;
  script?: string;
}

type PipelineStep = 'idle' | 'topic' | 'script' | 'split' | 'audio' | 'scenes' | 'adjust' | 'compose' | 'export' | 'completed';

interface SplitScene {
  id: number;
  text: string;
  estimatedMs: number;
}

// ============================================
// SceneCard Component (메모이제이션된 씬 편집 컴포넌트)
// ============================================

interface SceneCardProps {
  scene: SplitScene;
  index: number;
  totalScenes: number;
  isInOptimalRange: (ms: number) => boolean;
  calculateEstimatedMs: (text: string) => number;
  onUpdate: (id: number, text: string, estimatedMs: number) => void;
  onMergeWithPrev: () => void;  // + 버튼: 이전 씬과 합치기
  onSplitScene: (id: number) => void;  // - 버튼: 씬 분리
  onAddScene: (afterId: number) => void;
  onRemove: (id: number) => void;
  onSaveHistory: () => void;
  canMerge: boolean;  // 이전 씬이 있는지
  canSplit: boolean;  // 분리 가능한지 (마침표가 있는지)
  isDragging: boolean;
  isDragOver: boolean;
  dropMode: 'reorder' | 'merge' | null;
  onDragStart: (e: React.DragEvent, id: number) => void;
  onDragOver: (e: React.DragEvent, id: number) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, id: number) => void;
  onDragEnd: () => void;
}

const SceneCard = memo(function SceneCard({
  scene,
  index,
  totalScenes,
  isInOptimalRange,
  calculateEstimatedMs,
  onUpdate,
  onMergeWithPrev,
  onSplitScene,
  onAddScene,
  onRemove,
  onSaveHistory,
  canMerge,
  canSplit,
  isDragging,
  isDragOver,
  dropMode,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: SceneCardProps) {
  // 로컬 state로 텍스트 관리 (리렌더링 방지)
  const [localText, setLocalText] = useState(scene.text);
  const [localEstimatedMs, setLocalEstimatedMs] = useState(scene.estimatedMs);
  
  // 외부에서 scene.text가 변경되면 (예: undo/redo) 로컬 state 업데이트
  useEffect(() => {
    setLocalText(scene.text);
    setLocalEstimatedMs(scene.estimatedMs);
  }, [scene.text, scene.estimatedMs]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    const newEstimatedMs = calculateEstimatedMs(newText);
    setLocalText(newText);
    setLocalEstimatedMs(newEstimatedMs);
    // 상위 state에도 업데이트 (하지만 로컬 state가 우선)
    onUpdate(scene.id, newText, newEstimatedMs);
  };

  const inRange = isInOptimalRange(localEstimatedMs);
  const seconds = (localEstimatedMs / 1000).toFixed(1);
  
  // 로컬 텍스트 기반으로 분리 가능 여부 계산
  const localCanSplit = (() => {
    const periodIndex = localText.search(/\.\s/);
    if (periodIndex === -1) return false;
    const afterPeriod = localText.substring(periodIndex + 1).trim();
    return afterPeriod.length > 0;
  })();

  return (
    <div 
      draggable
      onDragStart={(e) => onDragStart(e, scene.id)}
      onDragOver={(e) => onDragOver(e, scene.id)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, scene.id)}
      onDragEnd={onDragEnd}
      className={`bg-gray-800 rounded-lg p-4 border-l-4 transition-all
        ${inRange ? 'border-green-500' : localEstimatedMs < 4000 ? 'border-yellow-500' : 'border-red-500'}
        ${isDragging ? 'opacity-50 scale-95' : ''}
        ${isDragOver && dropMode === 'merge' ? 'ring-2 ring-purple-500 bg-purple-900/30' : ''}
        ${isDragOver && dropMode === 'reorder' ? 'ring-2 ring-blue-500' : ''}
      `}
    >
      {/* 드래그 오버 힌트 */}
      {isDragOver && (
        <div className={`mb-2 text-center py-1 rounded text-xs font-medium ${
          dropMode === 'merge' ? 'bg-purple-600 text-white' : 'bg-blue-600 text-white'
        }`}>
          {dropMode === 'merge' ? '🔗 여기에 놓으면 합쳐집니다' : '↕️ 여기에 놓으면 이동됩니다'}
        </div>
      )}
      
      {/* 헤더 - 드래그 핸들 */}
      <div className="flex items-center justify-between mb-2 cursor-grab active:cursor-grabbing">
        <div className="flex items-center gap-2">
          {/* 드래그 핸들 */}
          <span className="text-gray-500 text-lg cursor-grab hover:text-gray-300 select-none" title="드래그하여 순서 변경">⋮⋮</span>
          <span className="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold select-none">
            {index + 1}
          </span>
          <span className={`text-lg font-mono font-bold ${
            inRange ? 'text-green-400' : localEstimatedMs < 4000 ? 'text-yellow-400' : 'text-red-400'
          }`}>
            {seconds}초
          </span>
          {!inRange && (
            <span className="text-xs px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400">
              {localEstimatedMs < 4000 ? '너무 짧음' : '너무 김'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* + 버튼: 이전 씬과 합치기 */}
          <button
            onClick={onMergeWithPrev}
            disabled={!canMerge}
            className={`w-7 h-7 flex items-center justify-center rounded font-bold text-lg transition-all
              ${canMerge 
                ? 'bg-green-600 hover:bg-green-500 text-white' 
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}
            title={canMerge ? "이전 씬과 합치기 (+)" : "첫 번째 씬입니다"}
          >
            +
          </button>
          {/* - 버튼: 씬 분리 (마침표 기준) */}
          <button
            onClick={() => onSplitScene(scene.id)}
            disabled={!localCanSplit}
            className={`w-7 h-7 flex items-center justify-center rounded font-bold text-lg transition-all
              ${localCanSplit 
                ? 'bg-orange-600 hover:bg-orange-500 text-white' 
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}
            title={localCanSplit ? "마침표 기준으로 분리 (-)" : "분리할 문장이 없습니다"}
          >
            −
          </button>
          {/* 새 씬 추가 */}
          <button
            onClick={() => onAddScene(scene.id)}
            className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-gray-700 rounded"
            title="아래에 새 씬 추가"
          >
            📝
          </button>
          {/* 씬 삭제 */}
          {totalScenes > 1 && (
            <button
              onClick={() => onRemove(scene.id)}
              className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded"
              title="씬 삭제"
            >
              🗑️
            </button>
          )}
        </div>
      </div>

      {/* 텍스트 입력 */}
      <textarea
        value={localText}
        onChange={handleTextChange}
        onBlur={onSaveHistory}
        onMouseDown={(e) => e.stopPropagation()}
        onDragStart={(e) => e.preventDefault()}
        draggable={false}
        placeholder="씬 내용을 입력하세요..."
        className="w-full h-20 bg-gray-900 border border-gray-700 rounded-lg p-3 text-white text-sm resize-none focus:border-blue-500 focus:outline-none cursor-text"
      />

      {/* 분할 힌트 */}
      {localEstimatedMs > 8000 && (
        <p className="text-xs text-gray-500 mt-2">
          💡 마침표(.) 위치에서 Enter를 누르면 텍스트를 나눌 수 있습니다
        </p>
      )}

      {/* 글자 수 표시 */}
      <div className="flex justify-between text-xs text-gray-500 mt-2">
        <span>{localText.replace(/\s/g, '').length}글자</span>
        <span>≈ {seconds}초 (초당 4.5글자 기준)</span>
      </div>
    </div>
  );
});

// ============================================
// Main Component
// ============================================

export default function Home() {
  // 입력 상태
  const [topic, setTopic] = useState('');
  const [category, setCategory] = useState('건강');
  const [targetDuration, setTargetDuration] = useState<30 | 60>(30);
  const [scriptAI, setScriptAI] = useState<'claude' | 'gpt-5' | 'gemini'>('claude');
  const [videoAI, setVideoAI] = useState<'veo' | 'higgsfield'>('veo');
  const [higgsfieldModel, setHiggsfieldModel] = useState<'seedance-1.5' | 'kling-2.6' | 'wan-2.6' | 'minimax-hailuo'>('seedance-1.5');
  const [enableSubtitles, setEnableSubtitles] = useState(true);
  const [enableBGM, setEnableBGM] = useState(false);

  // 파이프라인 상태
  const [currentStep, setCurrentStep] = useState<PipelineStep>('idle');
  const [timeline, setTimeline] = useState<TimelineState | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  // 편집 상태
  const [editingScript, setEditingScript] = useState(false);
  const [editedScript, setEditedScript] = useState('');
  const [editingSceneId, setEditingSceneId] = useState<number | null>(null);
  const [editedSceneText, setEditedSceneText] = useState('');
  const [editedScenePrompt, setEditedScenePrompt] = useState('');
  
  // 음성 길이 조절 상태
  const [showAudioAdjust, setShowAudioAdjust] = useState(false);
  const [audioAdjustments, setAudioAdjustments] = useState<{ [sceneId: number]: number }>({});
  
  // 스크립트 분할 상태
  const [splitScenes, setSplitScenes] = useState<{ id: number; text: string; estimatedMs: number }[]>([]);
  
  // 실행 취소/다시 실행을 위한 히스토리
  const [splitHistory, setSplitHistory] = useState<{ id: number; text: string; estimatedMs: number }[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  
  // 드래그 앤 드롭 상태
  const [draggedSceneId, setDraggedSceneId] = useState<number | null>(null);
  const [dragOverSceneId, setDragOverSceneId] = useState<number | null>(null);
  const [dropMode, setDropMode] = useState<'reorder' | 'merge' | null>(null);

  // 미리보기 상태
  const [expandedScene, setExpandedScene] = useState<number | null>(null);
  const [playingAudio, setPlayingAudio] = useState<number | null>(null);
  const audioRefs = useRef<{ [key: number]: HTMLAudioElement | null }>({});

  // 🔍 주제찾기 상태
  const [recommendedTopics, setRecommendedTopics] = useState<string[]>([]);
  const [isLoadingTopics, setIsLoadingTopics] = useState(false);

  // 카테고리 목록
  const categories = ['건강', '재테크', '운동', '요리', '생활팁', '교양', '취미', '기타'];

  // 로그 추가
  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  }, []);

  // ============================================
  // 🔍 주제찾기
  // ============================================
  interface TopicRecommendation {
    topic: string;
    reason: string;
    hook: string;
  }
  const [topicRecommendations, setTopicRecommendations] = useState<TopicRecommendation[]>([]);

  const findTopics = async () => {
    setIsLoadingTopics(true);
    setCurrentStep('topic');
    setTopicRecommendations([]);
    addLog(`🔍 "${category}" 카테고리에서 주제 찾는 중...`);

    try {
      const response = await fetch('/api/recommend-topic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          category,
          count: 5,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || '주제 추천 실패');
      }

      const recommendations = data.recommendations || [];
      setTopicRecommendations(recommendations);
      setRecommendedTopics(recommendations.map((r: TopicRecommendation) => r.topic));
      addLog(`✅ ${recommendations.length}개 주제 추천 완료`);
    } catch (err) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류';
      addLog(`❌ 주제 추천 오류: ${message}`);
      setError(message);
    } finally {
      setIsLoadingTopics(false);
    }
  };

  const selectTopic = (selectedTopic: string) => {
    setTopic(selectedTopic);
    addLog(`📌 주제 선택: ${selectedTopic}`);
  };

  const clearTopicSearch = () => {
    setRecommendedTopics([]);
    setTopicRecommendations([]);
    setCurrentStep('idle');
  };

  // 오디오 재생/정지
  const toggleAudio = (sceneId: number) => {
    const audio = audioRefs.current[sceneId];
    if (!audio) return;

    if (playingAudio === sceneId) {
      audio.pause();
      setPlayingAudio(null);
    } else {
      Object.values(audioRefs.current).forEach(a => a?.pause());
      audio.currentTime = 0;
      audio.play();
      setPlayingAudio(sceneId);
    }
  };

  // ============================================
  // 스크립트 수정
  // ============================================
  const startEditScript = () => {
    if (timeline?.script) {
      setEditedScript(timeline.script);
      setEditingScript(true);
    }
  };

  const saveEditedScript = async () => {
    if (!timeline || !editedScript.trim()) return;

    setIsProcessing(true);
    addLog('📝 스크립트 수정 중...');

    try {
      const response = await fetch(`/api/shorts/${timeline.id}/script`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script: editedScript }),
      });

      const data = await response.json();
      if (!data.success) throw new Error(data.error);

      setTimeline(prev => prev ? {
        ...prev,
        script: data.timeline.script,
        scenes: data.timeline.scenes,
        totalDurationMs: data.timeline.estimatedDurationMs,
      } : null);

      setEditingScript(false);
      addLog(`✅ 스크립트 수정 완료: ${data.timeline.scenes.length}개 씬`);
    } catch (err) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류';
      addLog(`❌ 스크립트 수정 실패: ${message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // ============================================
  // 씬 수정
  // ============================================
  const startEditScene = (scene: Scene) => {
    setEditingSceneId(scene.id);
    setEditedSceneText(scene.text);
    setEditedScenePrompt(scene.prompt || '');
  };

  const cancelEditScene = () => {
    setEditingSceneId(null);
    setEditedSceneText('');
    setEditedScenePrompt('');
  };

  const saveEditedScene = async (regenerateAudio: boolean, regenerateVideo: boolean) => {
    if (!timeline || editingSceneId === null) return;

    setIsProcessing(true);
    addLog(`📝 씬 ${editingSceneId} 수정 중...`);

    try {
      const response = await fetch(`/api/shorts/${timeline.id}/scene/${editingSceneId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: editedSceneText,
          prompt: editedScenePrompt,
          regenerateAudio,
          regenerateVideo,
        }),
      });

      const data = await response.json();
      if (!data.success) throw new Error(data.error);

      // 씬 업데이트
      setTimeline(prev => {
        if (!prev) return null;
        const updatedScenes = prev.scenes.map(s => 
          s.id === editingSceneId ? { ...s, ...data.scene } : s
        );
        return { ...prev, scenes: updatedScenes };
      });

      cancelEditScene();
      addLog(`✅ 씬 ${editingSceneId} 수정 완료`);

      // 영상 재생성 요청 시 폴링 시작
      if (regenerateVideo) {
        startPolling();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류';
      addLog(`❌ 씬 수정 실패: ${message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // ============================================
  // 예상 시간 계산 (한국어 TTS 기준 초당 4.5글자)
  // ============================================
  const CHARS_PER_SECOND = 4.5;
  
  const calculateEstimatedMs = (text: string): number => {
    const charCount = text.replace(/\s/g, '').length;
    return Math.round((charCount / CHARS_PER_SECOND) * 1000);
  };

  const isInOptimalRange = (ms: number): boolean => {
    return ms >= 4000 && ms <= 8000;
  };

  // ============================================
  // 실행 취소/다시 실행 (Ctrl+Z / Ctrl+Shift+Z)
  // ============================================
  const saveToHistory = useCallback((scenes: typeof splitScenes) => {
    setSplitHistory(prev => {
      // 현재 위치 이후의 히스토리 삭제 (새 분기)
      const newHistory = prev.slice(0, historyIndex + 1);
      // 현재 상태 추가
      newHistory.push(JSON.parse(JSON.stringify(scenes)));
      // 최대 50개 유지
      if (newHistory.length > 50) newHistory.shift();
      return newHistory;
    });
    setHistoryIndex(prev => Math.min(prev + 1, 49));
  }, [historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const prevState = splitHistory[historyIndex - 1];
      setSplitScenes(JSON.parse(JSON.stringify(prevState)));
      setHistoryIndex(prev => prev - 1);
      addLog('↩️ 실행 취소');
    }
  }, [historyIndex, splitHistory, addLog]);

  const redo = useCallback(() => {
    if (historyIndex < splitHistory.length - 1) {
      const nextState = splitHistory[historyIndex + 1];
      setSplitScenes(JSON.parse(JSON.stringify(nextState)));
      setHistoryIndex(prev => prev + 1);
      addLog('↪️ 다시 실행');
    }
  }, [historyIndex, splitHistory, addLog]);

  // 키보드 단축키 핸들러
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // split 단계에서만 작동
      if (currentStep !== 'split') return;
      
      // Ctrl+Z 또는 Cmd+Z (Mac)
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
        undo();
      }
      // Ctrl+Shift+Z 또는 Ctrl+Y (다시 실행)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentStep, undo, redo]);

  // ============================================
  // 스크립트 분할 단계
  // ============================================
  const initSplitScenes = () => {
    if (!timeline?.scenes) return;
    const scenes = timeline.scenes.map(s => ({
      id: s.id,
      text: s.text,
      estimatedMs: calculateEstimatedMs(s.text),
    }));
    setSplitScenes(scenes);
    // 히스토리 초기화
    setSplitHistory([JSON.parse(JSON.stringify(scenes))]);
    setHistoryIndex(0);
  };

  const updateSplitScene = useCallback((id: number, text: string, estimatedMs: number) => {
    setSplitScenes(prev => {
      const newScenes = prev.map(s => 
        s.id === id ? { ...s, text, estimatedMs } : s
      );
      return newScenes;
    });
    // 텍스트 변경은 입력 중이므로 히스토리에 저장하지 않음 (blur 시 저장)
  }, []);

  const saveCurrentState = () => {
    // 현재 상태를 히스토리에 저장 (blur 시 호출)
    saveToHistory(splitScenes);
  };

  const addSplitScene = (afterId: number) => {
    saveToHistory(splitScenes); // 먼저 현재 상태 저장
    setSplitScenes(prev => {
      const index = prev.findIndex(s => s.id === afterId);
      const newId = Math.max(...prev.map(s => s.id)) + 1;
      const newScene = { id: newId, text: '', estimatedMs: 0 };
      const newScenes = [...prev];
      newScenes.splice(index + 1, 0, newScene);
      return newScenes.map((s, i) => ({ ...s, id: i + 1 }));
    });
  };

  const removeSplitScene = (id: number) => {
    if (splitScenes.length <= 1) return;
    saveToHistory(splitScenes); // 먼저 현재 상태 저장
    setSplitScenes(prev => {
      const filtered = prev.filter(s => s.id !== id);
      return filtered.map((s, i) => ({ ...s, id: i + 1 }));
    });
  };

  const mergeSplitScenes = (id: number) => {
    saveToHistory(splitScenes); // 먼저 현재 상태 저장
    setSplitScenes(prev => {
      const index = prev.findIndex(s => s.id === id);
      if (index < prev.length - 1) {
        const current = prev[index];
        const next = prev[index + 1];
        const merged = {
          id: current.id,
          text: current.text + ' ' + next.text,
          estimatedMs: calculateEstimatedMs(current.text + ' ' + next.text),
        };
        const newScenes = [...prev];
        newScenes.splice(index, 2, merged);
        return newScenes.map((s, i) => ({ ...s, id: i + 1 }));
      }
      return prev;
    });
  };

  const splitSceneAtCursor = (id: number, splitIndex: number) => {
    saveToHistory(splitScenes); // 먼저 현재 상태 저장
    setSplitScenes(prev => {
      const scene = prev.find(s => s.id === id);
      if (!scene || splitIndex <= 0 || splitIndex >= scene.text.length) return prev;
      
      const text1 = scene.text.substring(0, splitIndex).trim();
      const text2 = scene.text.substring(splitIndex).trim();
      
      if (!text1 || !text2) return prev;
      
      const index = prev.findIndex(s => s.id === id);
      const newScenes = [...prev];
      newScenes.splice(index, 1, 
        { id: id, text: text1, estimatedMs: calculateEstimatedMs(text1) },
        { id: id + 1, text: text2, estimatedMs: calculateEstimatedMs(text2) }
      );
      return newScenes.map((s, i) => ({ ...s, id: i + 1 }));
    });
  };

  // 마침표 기준으로 씬 분리 (- 버튼)
  const splitSceneAtPeriod = useCallback((id: number) => {
    saveToHistory(splitScenes);
    setSplitScenes(prev => {
      const scene = prev.find(s => s.id === id);
      if (!scene) return prev;
      
      // 마침표 + 공백 또는 마침표 + 끝 위치 찾기
      const periodIndex = scene.text.search(/\.\s|\.$/);
      if (periodIndex === -1) return prev;
      
      const splitPoint = periodIndex + 1; // 마침표 포함
      const text1 = scene.text.substring(0, splitPoint).trim();
      const text2 = scene.text.substring(splitPoint).trim();
      
      if (!text1 || !text2) return prev;
      
      const index = prev.findIndex(s => s.id === id);
      const newScenes = [...prev];
      newScenes.splice(index, 1, 
        { id: id, text: text1, estimatedMs: calculateEstimatedMs(text1) },
        { id: id + 1, text: text2, estimatedMs: calculateEstimatedMs(text2) }
      );
      
      addLog(`✂️ 씬 분리: "${text1.substring(0, 20)}..." / "${text2.substring(0, 20)}..."`);
      return newScenes.map((s, i) => ({ ...s, id: i + 1 }));
    });
  }, [splitScenes, calculateEstimatedMs, addLog]);

  // 텍스트에 분리 가능한 마침표가 있는지 확인
  const canSplitScene = useCallback((text: string): boolean => {
    // 마침표 뒤에 더 텍스트가 있는지 확인
    const periodIndex = text.search(/\.\s/);
    if (periodIndex === -1) return false;
    
    const afterPeriod = text.substring(periodIndex + 1).trim();
    return afterPeriod.length > 0;
  }, []);

  // ============================================
  // 드래그 앤 드롭
  // ============================================
  const handleDragStart = (e: React.DragEvent, sceneId: number) => {
    setDraggedSceneId(sceneId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', sceneId.toString());
  };

  const handleDragOver = (e: React.DragEvent, sceneId: number) => {
    e.preventDefault();
    if (draggedSceneId === sceneId) return;
    
    setDragOverSceneId(sceneId);
    
    // Shift 키를 누르면 합치기 모드
    if (e.shiftKey) {
      setDropMode('merge');
      e.dataTransfer.dropEffect = 'copy';
    } else {
      setDropMode('reorder');
      e.dataTransfer.dropEffect = 'move';
    }
  };

  const handleDragLeave = () => {
    setDragOverSceneId(null);
    setDropMode(null);
  };

  const handleDrop = (e: React.DragEvent, targetSceneId: number) => {
    e.preventDefault();
    
    if (draggedSceneId === null || draggedSceneId === targetSceneId) {
      resetDragState();
      return;
    }

    saveToHistory(splitScenes); // 먼저 현재 상태 저장

    if (e.shiftKey || dropMode === 'merge') {
      // 합치기 모드: 드래그한 씬을 타겟 씬에 합침
      setSplitScenes(prev => {
        const draggedScene = prev.find(s => s.id === draggedSceneId);
        const targetScene = prev.find(s => s.id === targetSceneId);
        
        if (!draggedScene || !targetScene) return prev;

        const mergedText = targetScene.text + ' ' + draggedScene.text;
        const mergedScene = {
          id: targetScene.id,
          text: mergedText,
          estimatedMs: calculateEstimatedMs(mergedText),
        };

        // 드래그한 씬 제거하고 타겟 씬 업데이트
        const newScenes = prev
          .filter(s => s.id !== draggedSceneId)
          .map(s => s.id === targetSceneId ? mergedScene : s);
        
        return newScenes.map((s, i) => ({ ...s, id: i + 1 }));
      });
      addLog(`🔗 씬 합침`);
    } else {
      // 순서 변경 모드
      setSplitScenes(prev => {
        const draggedIndex = prev.findIndex(s => s.id === draggedSceneId);
        const targetIndex = prev.findIndex(s => s.id === targetSceneId);
        
        if (draggedIndex === -1 || targetIndex === -1) return prev;

        const newScenes = [...prev];
        const [draggedScene] = newScenes.splice(draggedIndex, 1);
        newScenes.splice(targetIndex, 0, draggedScene);
        
        return newScenes.map((s, i) => ({ ...s, id: i + 1 }));
      });
      addLog(`↕️ 씬 순서 변경`);
    }

    resetDragState();
  };

  const handleDragEnd = () => {
    resetDragState();
  };

  const resetDragState = () => {
    setDraggedSceneId(null);
    setDragOverSceneId(null);
    setDropMode(null);
  };

  const confirmSplitScenes = async () => {
    if (!timeline) return;
    
    // 빈 씬 제거
    const validScenes = splitScenes.filter(s => s.text.trim().length > 0);
    if (validScenes.length === 0) {
      setError('최소 1개의 씬이 필요합니다.');
      return;
    }

    setIsProcessing(true);
    addLog('📋 스크립트 분할 확정 중...');

    try {
      const response = await fetch(`/api/shorts/${timeline.id}/split`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenes: validScenes.map((s, i) => ({
            id: i + 1,
            text: s.text.trim(),
          })),
        }),
      });

      const data = await response.json();
      if (!data.success) throw new Error(data.error);

      setTimeline(prev => prev ? {
        ...prev,
        scenes: data.timeline.scenes,
        totalDurationMs: data.timeline.estimatedDurationMs,
        script: validScenes.map(s => s.text).join(' '),
      } : null);

      addLog(`✅ 스크립트 분할 완료: ${validScenes.length}개 씬`);
      setCurrentStep('audio');
    } catch (err) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류';
      addLog(`❌ 분할 실패: ${message}`);
      setError(message);
    } finally {
      setIsProcessing(false);
    }
  };

  const getTotalEstimatedMs = () => {
    return splitScenes.reduce((sum, s) => sum + s.estimatedMs, 0);
  };

  // ============================================
  // 음성 길이 조절
  // ============================================
  const initAudioAdjustments = () => {
    if (!timeline?.scenes) return;
    const adjustments: { [key: number]: number } = {};
    timeline.scenes.forEach(scene => {
      adjustments[scene.id] = scene.audioDurationMs;
    });
    setAudioAdjustments(adjustments);
    setShowAudioAdjust(true);
  };

  const updateAudioAdjustment = (sceneId: number, durationMs: number) => {
    setAudioAdjustments(prev => ({
      ...prev,
      [sceneId]: durationMs,
    }));
  };

  const applyAudioAdjustments = async () => {
    if (!timeline) return;

    setIsProcessing(true);
    addLog('🎚️ 음성 길이 조절 중...');

    try {
      const sceneAdjustments = Object.entries(audioAdjustments).map(([id, duration]) => ({
        sceneId: parseInt(id),
        targetDurationMs: duration,
      }));

      const response = await fetch(`/api/shorts/${timeline.id}/audio/adjust`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sceneAdjustments }),
      });

      const data = await response.json();
      if (!data.success) throw new Error(data.error);

      setTimeline(prev => prev ? {
        ...prev,
        scenes: data.timeline.scenes,
        totalDurationMs: data.timeline.totalDurationMs,
        fullAudioPath: data.timeline.fullAudioPath,
      } : null);

      setShowAudioAdjust(false);
      addLog(`✅ 음성 길이 조절 완료: 총 ${Math.round(data.timeline.totalDurationMs / 1000)}초`);
    } catch (err) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류';
      addLog(`❌ 음성 조절 실패: ${message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const getTotalAdjustedDuration = () => {
    return Object.values(audioAdjustments).reduce((sum, d) => sum + d, 0);
  };

  // ============================================
  // Step 1: 스크립트 생성
  // ============================================
  const startPipeline = async () => {
    if (!topic.trim()) {
      setError('주제를 입력해주세요.');
      return;
    }

    setError(null);
    setIsProcessing(true);
    setCurrentStep('script');
    setLogs([]);
    addLog(`🚀 쇼츠 생성 시작: "${topic}"`);

    try {
      addLog('📝 스크립트 생성 중...');
      
      const response = await fetch('/api/shorts/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          category,
          targetDuration,
          options: { scriptAI, videoAI, higgsfieldModel, enableSubtitles, enableBGM },
        }),
      });

      const data = await response.json();
      if (!data.success) throw new Error(data.error || '스크립트 생성 실패');

      const newTimeline = {
        id: data.timeline.id,
        topic: data.timeline.topic,
        status: data.timeline.status,
        currentStep: data.timeline.currentStep,
        scenes: data.timeline.scenes,
        totalDurationMs: data.timeline.estimatedDurationMs,
        script: data.timeline.script,
      };
      setTimeline(newTimeline);

      // 분할 씬 초기화
      const scenes = data.timeline.scenes.map((s: Scene) => ({
        id: s.id,
        text: s.text,
        estimatedMs: calculateEstimatedMs(s.text),
      }));
      setSplitScenes(scenes);

      addLog(`✅ 스크립트 생성 완료: ${data.timeline.sceneCount}개 씬`);
      setCurrentStep('split');
    } catch (err) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류';
      setError(message);
      addLog(`❌ 오류: ${message}`);
      setCurrentStep('idle');
    } finally {
      setIsProcessing(false);
    }
  };

  // ============================================
  // Step 2: 음성 생성
  // ============================================
  const generateAudio = async () => {
    if (!timeline) return;

    setIsProcessing(true);
    setError(null);

    try {
      // Veo: 음성이 영상에 자동 포함됨 → TTS 생성 건너뛰기
      if (videoAI === 'veo') {
        addLog('🎙️ Veo 3: 영상 생성 시 음성이 자동으로 포함됩니다');
        
        // splitScenes의 estimatedMs를 audioDurationMs로 사용
        const sourceScenes = splitScenes.length > 0 ? splitScenes : timeline.scenes;
        const scenesWithDuration = sourceScenes.map((s: any) => ({
          id: s.id,
          text: s.text,
          audioDurationMs: s.estimatedMs || s.audioDurationMs || 6000,
          audioIncluded: true, // Veo는 영상에 음성 포함
          videoStatus: 'pending' as const,
        }));
        
        const totalMs = scenesWithDuration.reduce((acc, s) => acc + s.audioDurationMs, 0);
        
        setTimeline(prev => prev ? {
          ...prev,
          status: 'audio_completed' as any,
          currentStep: 'scenes' as any,
          scenes: scenesWithDuration,
          totalDurationMs: totalMs,
          fullAudioPath: undefined, // Veo는 별도 오디오 파일 없음
        } : null);

        addLog(`✅ ${scenesWithDuration.length}개 씬 준비 완료 (예상 ${Math.round(totalMs / 1000)}초)`);
        setCurrentStep('scenes');
      } else {
        // Higgsfield: TTS로 음성 생성
        addLog('🎙️ TTS 음성 생성 중...');
        
        const response = await fetch(`/api/shorts/${timeline.id}/audio`, { method: 'POST' });
        const data = await response.json();
        if (!data.success) throw new Error(data.error || '음성 생성 실패');

        setTimeline(prev => prev ? {
          ...prev,
          status: data.timeline.status,
          currentStep: data.timeline.currentStep,
          scenes: data.timeline.scenes.map((s: any) => ({ ...s, audioIncluded: false })),
          totalDurationMs: data.timeline.totalDurationMs,
          fullAudioPath: data.timeline.fullAudioPath,
        } : null);

        addLog(`✅ TTS 음성 생성 완료: ${Math.round(data.timeline.totalDurationMs / 1000)}초`);
        setCurrentStep('scenes');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류';
      setError(message);
      addLog(`❌ 오류: ${message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // ============================================
  // Step 3: 씬 영상 생성
  // ============================================
  const generateScenes = async () => {
    if (!timeline) return;

    setIsProcessing(true);
    setError(null);
    addLog('🎬 씬 영상 생성 요청 중...');

    try {
      const response = await fetch(`/api/shorts/${timeline.id}/scenes`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoAI,
          higgsfieldModel,
        }),
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || '씬 생성 실패');

      setTimeline(prev => prev ? {
        ...prev,
        status: data.timeline.status,
        currentStep: data.timeline.currentStep,
        scenes: data.timeline.scenes,
      } : null);

      addLog(`✅ 씬 영상 생성 요청 완료`);
      startPolling();
    } catch (err) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류';
      setError(message);
      addLog(`❌ 오류: ${message}`);
      setIsProcessing(false);
    }
  };

  // 씬 상태 폴링
  const startPolling = useCallback(() => {
    if (!timeline) return;

    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/shorts/${timeline.id}/scenes`);
        const data = await response.json();
        if (!data.success) throw new Error(data.error);

        setTimeline(prev => prev ? {
          ...prev,
          status: data.timeline.status,
          currentStep: data.timeline.currentStep,
          scenes: data.timeline.scenes,
        } : null);

        const { summary, allCompleted } = data.timeline;
        addLog(`📊 진행률: ${summary.completed}/${summary.total} 완료`);

        if (allCompleted) {
          addLog('✅ 모든 씬 영상 생성 완료');
          setCurrentStep('adjust');
          setIsProcessing(false);
          return true;
        }
        return false;
      } catch (err) {
        console.error('Status check error:', err);
        return false;
      }
    };

    const interval = setInterval(async () => {
      const done = await checkStatus();
      if (done) clearInterval(interval);
    }, 15000);

    checkStatus();
  }, [timeline?.id, addLog]);

  // ============================================
  // Step 4~6
  // ============================================
  const adjustVideos = async () => {
    if (!timeline) return;
    setIsProcessing(true);
    setError(null);
    addLog('🔧 영상 길이 보정 중...');

    try {
      const response = await fetch(`/api/shorts/${timeline.id}/adjust`, { method: 'POST' });
      const data = await response.json();
      if (!data.success) throw new Error(data.error);

      setTimeline(prev => prev ? {
        ...prev,
        status: data.timeline.status,
        currentStep: data.timeline.currentStep,
        scenes: data.timeline.scenes,
      } : null);

      addLog(`✅ 영상 보정 완료`);
      setCurrentStep('compose');
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류');
    } finally {
      setIsProcessing(false);
    }
  };

  const composeTimeline = async () => {
    if (!timeline) return;
    setIsProcessing(true);
    setError(null);
    addLog('🎞️ 타임라인 조립 중...');

    try {
      const response = await fetch(`/api/shorts/${timeline.id}/compose`, { method: 'POST' });
      const data = await response.json();
      if (!data.success) throw new Error(data.error);

      setTimeline(prev => prev ? {
        ...prev,
        status: data.timeline.status,
        currentStep: data.timeline.currentStep,
        totalDurationMs: data.timeline.totalDurationMs,
        fullVideoPath: data.timeline.composedVideoPath,
      } : null);

      addLog(`✅ 타임라인 조립 완료`);
      setCurrentStep('export');
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류');
    } finally {
      setIsProcessing(false);
    }
  };

  const exportFinal = async () => {
    if (!timeline) return;
    setIsProcessing(true);
    setError(null);
    addLog('📦 최종 내보내기 중...');

    try {
      const response = await fetch(`/api/shorts/${timeline.id}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enableSubtitles, enableBGM }),
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error);

      setTimeline(prev => prev ? {
        ...prev,
        status: 'completed',
        fullVideoPath: data.result.videoPath,
        totalDurationMs: data.result.totalDurationMs,
      } : null);

      addLog(`🎉 완료! (${data.result.fileSizeMB}MB)`);
      setCurrentStep('completed');
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류');
    } finally {
      setIsProcessing(false);
    }
  };

  // ============================================
  // UI Components
  // ============================================

  // 이전 단계로 돌아가기
  const goToPreviousStep = () => {
    const order: PipelineStep[] = ['idle', 'script', 'split', 'audio', 'scenes', 'adjust', 'compose', 'export', 'completed'];
    const currentIndex = order.indexOf(currentStep);
    
    if (currentIndex > 1) { // 'script' 이후부터 가능
      const prevStep = order[currentIndex - 1];
      setCurrentStep(prevStep);
      addLog(`⬅️ 이전 단계로 이동: ${prevStep}`);
      
      // split 단계로 돌아갈 때 splitScenes 초기화
      if (prevStep === 'split' && timeline?.scenes) {
        const scenes = timeline.scenes.map(s => ({
          id: s.id,
          text: s.text,
          estimatedMs: calculateEstimatedMs(s.text),
        }));
        setSplitScenes(scenes);
        setSplitHistory([JSON.parse(JSON.stringify(scenes))]);
        setHistoryIndex(0);
      }
    }
  };

  // 특정 단계로 직접 이동
  const goToStep = (targetStep: PipelineStep) => {
    const order: PipelineStep[] = ['idle', 'script', 'split', 'audio', 'scenes', 'adjust', 'compose', 'export', 'completed'];
    const currentIndex = order.indexOf(currentStep);
    const targetIndex = order.indexOf(targetStep);
    
    // 완료된 단계로만 이동 가능 (현재 단계 포함)
    if (targetIndex <= currentIndex && targetIndex > 0) {
      setCurrentStep(targetStep);
      addLog(`📍 단계 이동: ${targetStep}`);
      
      if (targetStep === 'split' && timeline?.scenes) {
        const scenes = timeline.scenes.map(s => ({
          id: s.id,
          text: s.text,
          estimatedMs: calculateEstimatedMs(s.text),
        }));
        setSplitScenes(scenes);
        setSplitHistory([JSON.parse(JSON.stringify(scenes))]);
        setHistoryIndex(0);
      }
    }
  };

  const StepIndicator = () => {
    // Veo: 영상에 음성 자체 포함 → 음성 단계 불필요
    // Higgsfield: TTS로 음성 생성 필요
    const isVeo = videoAI === 'veo';
    
    const steps: { key: PipelineStep; label: string; icon: string; skip?: boolean }[] = [
      { key: 'topic', label: '주제찾기', icon: '🔍' },
      { key: 'script', label: '스크립트', icon: '📝' },
      { key: 'split', label: '시간분할', icon: '⏱️' },
      { key: 'audio', label: isVeo ? '음성 (자동)' : '음성 (TTS)', icon: '🎙️', skip: isVeo },
      { key: 'scenes', label: isVeo ? '씬 영상+음성' : '씬 영상', icon: '🎬' },
      { key: 'adjust', label: '보정', icon: '🔧' },
      { key: 'compose', label: '조립', icon: '🎞️' },
      { key: 'export', label: '내보내기', icon: '📦' },
    ];

    const order: PipelineStep[] = ['idle', 'topic', 'script', 'split', 'audio', 'scenes', 'adjust', 'compose', 'export', 'completed'];
    const currentIndex = order.indexOf(currentStep);

  return (
      <div className="flex items-center justify-center gap-2 mb-8 flex-wrap">
        {steps.map((step, index) => {
          const stepIndex = order.indexOf(step.key);
          const status = stepIndex < currentIndex ? 'completed' : stepIndex === currentIndex ? 'current' : 'pending';
          const canClick = status === 'completed'; // 완료된 단계만 클릭 가능
          
          return (
            <div key={step.key} className="flex items-center">
                <button
                onClick={() => canClick && goToStep(step.key)}
                disabled={!canClick}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all
                  ${status === 'completed' ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 cursor-pointer' : ''}
                  ${status === 'current' ? 'bg-blue-500/20 text-blue-400 animate-pulse cursor-default' : ''}
                  ${status === 'pending' ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : ''}
                `}
                title={canClick ? `${step.label} 단계로 돌아가기` : ''}
              >
                <span>{step.icon}</span>
                <span>{step.label}</span>
                {canClick && <span className="text-xs opacity-60">↩</span>}
                </button>
              {index < steps.length - 1 && (
                <div className={`w-6 h-0.5 mx-1 ${status === 'completed' ? 'bg-emerald-500' : 'bg-gray-700'}`} />
              )}
              </div>
          );
        })}
      </div>
    );
  };

  // 스크립트 편집 가능 미리보기
  const ScriptPreview = () => {
    if (!timeline?.script || currentStep === 'idle') return null;
    // split 단계에서는 SplitEditor가 표시됨
    if (currentStep === 'split') return null;

    return (
      <div className="bg-gray-900 rounded-xl p-5 mb-6 border border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            📝 스크립트
            <span className="text-sm font-normal text-gray-500">
              ({timeline.scenes.length}개 문장, 예상 {Math.round((timeline.totalDurationMs || 0) / 1000)}초)
            </span>
          </h3>
          {!editingScript && currentStep === 'audio' && (
                    <button
              onClick={() => goToStep('split')}
              className="text-sm bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded-lg"
                    >
              ✏️ 분할 수정
                    </button>
          )}
                  </div>

        {editingScript ? (
                  <div className="space-y-3">
            <textarea
              value={editedScript}
              onChange={(e) => setEditedScript(e.target.value)}
              className="w-full h-60 bg-gray-950 border border-gray-700 rounded-lg p-4 text-gray-300 text-sm leading-relaxed resize-none focus:border-blue-500 focus:outline-none"
            />
            <div className="flex gap-2 justify-end">
                      <button
                onClick={() => setEditingScript(false)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm"
              >
                취소
              </button>
              <button
                onClick={saveEditedScript}
                disabled={isProcessing}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white rounded-lg text-sm"
              >
                {isProcessing ? '저장 중...' : '저장 및 재분할'}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* 분할된 씬 목록 (음성 생성 전) */}
            {currentStep === 'audio' && !timeline.fullAudioPath && (
              <div className="space-y-2 mb-4">
                <p className="text-gray-400 text-sm mb-2">📋 분할된 씬 ({timeline.scenes.length}개)</p>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {timeline.scenes.map((scene, index) => {
                    const estimatedSec = (scene.audioDurationMs / 1000).toFixed(1);
                    const inRange = scene.audioDurationMs >= 4000 && scene.audioDurationMs <= 8000;
                    
                    return (
                      <div 
                        key={scene.id}
                        className={`bg-gray-800 rounded-lg p-3 border-l-4 ${
                          inRange ? 'border-green-500' : scene.audioDurationMs < 4000 ? 'border-yellow-500' : 'border-red-500'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                            {index + 1}
                          </span>
                          <span className={`text-sm font-mono font-bold ${
                            inRange ? 'text-green-400' : scene.audioDurationMs < 4000 ? 'text-yellow-400' : 'text-red-400'
                          }`}>
                            {estimatedSec}초
                          </span>
                          {!inRange && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">
                              {scene.audioDurationMs < 4000 ? '짧음' : '김'}
                            </span>
                          )}
                          </div>
                        <p className="text-gray-300 text-sm">{scene.text}</p>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between items-center text-xs text-gray-500 pt-2 border-t border-gray-700">
                  <span>총 예상 시간: {Math.round((timeline.totalDurationMs || 0) / 1000)}초</span>
                  <span>
                    {timeline.scenes.filter(s => s.audioDurationMs >= 4000 && s.audioDurationMs <= 8000).length}/{timeline.scenes.length} 최적 범위
                          </span>
                        </div>
                  </div>
            )}
            
            {/* 전체 스크립트 (음성 생성 후) */}
            {(currentStep !== 'audio' || timeline.fullAudioPath) && (
              <div className="bg-gray-950 rounded-lg p-4 text-gray-300 leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto">
                {timeline.script}
                </div>
            )}
          </>
              )}
            </div>
    );
  };

  // 스크립트 시간 분할 에디터
  const SplitEditor = () => {
    if (currentStep !== 'split' || splitScenes.length === 0) return null;

    const totalMs = getTotalEstimatedMs();
    const outOfRangeCount = splitScenes.filter(s => !isInOptimalRange(s.estimatedMs)).length;

    return (
      <div className="bg-gray-900 rounded-xl p-5 mb-6 border border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            ⏱️ 스크립트 시간 분할
          </h3>
          <div className="flex items-center gap-4 text-sm">
            {/* 실행취소/다시실행 버튼 */}
            <div className="flex items-center gap-1 mr-2">
                <button
                onClick={undo}
                disabled={historyIndex <= 0}
                className={`p-1.5 rounded ${historyIndex > 0 ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 cursor-not-allowed'}`}
                title="실행 취소 (Ctrl+Z)"
              >
                ↩️
                </button>
                <button
                onClick={redo}
                disabled={historyIndex >= splitHistory.length - 1}
                className={`p-1.5 rounded ${historyIndex < splitHistory.length - 1 ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 cursor-not-allowed'}`}
                title="다시 실행 (Ctrl+Shift+Z)"
              >
                ↪️
              </button>
                  </div>
            <span className="text-gray-400">
              총 <span className="text-white font-mono">{(totalMs / 1000).toFixed(1)}초</span>
            </span>
            <span className="text-gray-400">
              {splitScenes.length}개 씬
            </span>
            {outOfRangeCount > 0 && (
              <span className="text-yellow-400">
                ⚠️ {outOfRangeCount}개 범위 초과
              </span>
            )}
                  </div>
              </div>

        <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3 mb-4">
          <p className="text-blue-300 text-sm">
            💡 <strong>팁:</strong> 각 씬은 <span className="text-green-400 font-bold">4~8초</span> 사이가 AI 영상 생성에 최적입니다. 
            너무 길면 분할(✂️)하고, 너무 짧으면 합치기(🔗)를 사용하세요.
          </p>
          <p className="text-gray-400 text-xs mt-1">
            🖱️ <strong>드래그</strong>: 순서 변경 | <strong>Shift+드래그</strong>: 합치기 | 
            ⌨️ <kbd className="px-1 bg-gray-700 rounded">Ctrl+Z</kbd> 실행 취소
              </p>
            </div>

        <div className="space-y-3 max-h-[500px] overflow-y-auto mb-4">
          {splitScenes.map((scene, index) => (
            <SceneCard
              key={`${scene.id}-${splitScenes.length}`}
              scene={scene}
              index={index}
              totalScenes={splitScenes.length}
              isInOptimalRange={isInOptimalRange}
              calculateEstimatedMs={calculateEstimatedMs}
              onUpdate={updateSplitScene}
              onMergeWithPrev={() => index > 0 && mergeSplitScenes(splitScenes[index - 1].id)}
              onSplitScene={splitSceneAtPeriod}
              onAddScene={addSplitScene}
              onRemove={removeSplitScene}
              onSaveHistory={saveCurrentState}
              canMerge={index > 0}
              canSplit={canSplitScene(scene.text)}
              isDragging={draggedSceneId === scene.id}
              isDragOver={dragOverSceneId === scene.id}
              dropMode={dropMode}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
            />
          ))}
                  </div>

        {/* 액션 버튼 */}
        <div className="flex gap-3 justify-end">
                <button
            onClick={() => {
              setCurrentStep('idle');
              setTimeline(null);
              setSplitScenes([]);
            }}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm"
          >
            처음으로
                </button>
                <button
            onClick={confirmSplitScenes}
            disabled={isProcessing || splitScenes.every(s => !s.text.trim())}
            className="px-6 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 text-white font-medium rounded-lg"
          >
            {isProcessing 
              ? '처리 중...' 
              : videoAI === 'veo' 
                ? '✅ 분할 확정 → 영상+음성 생성으로'
                : '✅ 분할 확정 → TTS 생성으로'
            }
                    </button>
                  </div>
                  </div>
    );
  };

  // 음성 재생성 함수
  const regenerateAudio = async () => {
    if (!timeline) return;
    
    setIsProcessing(true);
    addLog('🔄 음성 재생성 시작...');
    
    try {
      // 현재 splitScenes 기준으로 타임라인 업데이트
      const updatedScenes = splitScenes.map((s, i) => ({
        id: i + 1,
        text: s.text,
        audioDurationMs: s.estimatedMs,
        videoStatus: 'pending' as const,
      }));
      
      // 타임라인 업데이트 API 호출
      const updateRes = await fetch(`/api/shorts/${timeline.id}/split`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          scenes: splitScenes.map(s => ({ id: s.id, text: s.text })),
        }),
      });
      
      if (!updateRes.ok) {
        throw new Error('타임라인 업데이트 실패');
      }
      
      // 음성 재생성
      const audioRes = await fetch(`/api/shorts/${timeline.id}/audio`, {
        method: 'POST',
      });
      
      if (!audioRes.ok) {
        throw new Error('음성 재생성 실패');
      }
      
      const data = await audioRes.json();
      setTimeline(data.timeline);
      addLog(`✅ 음성 재생성 완료: ${data.timeline.scenes.length}개 씬`);
      setCurrentStep('scenes');
      
    } catch (err) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류';
      setError(message);
      addLog(`❌ 오류: ${message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // 음성 미리보기 (씬별 수정 가능)
  const AudioPreview = () => {
    const isVeoMode = videoAI === 'veo';
    
    // Veo 모드: 별도 오디오 파일 없음, 영상에 포함
    if (isVeoMode) {
      if (currentStep === 'idle' || currentStep === 'script' || currentStep === 'split') return null;
      if (!timeline || timeline.scenes.length === 0) return null;
      
      return (
        <div className="bg-emerald-900/30 rounded-xl p-5 mb-6 border border-emerald-500/30">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-3xl">🎙️✨</span>
            <div>
              <h3 className="text-lg font-bold text-emerald-300">Veo 3: 영상에 음성 포함</h3>
              <p className="text-emerald-400/80 text-sm">
                각 씬 영상에 대사가 자동으로 더빙됩니다.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {timeline.scenes.map((scene, index) => (
              <div key={scene.id} className="bg-gray-900/50 rounded-lg p-3 flex items-center gap-3">
                <span className="w-6 h-6 bg-emerald-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                  {index + 1}
                </span>
                <p className="text-gray-300 text-sm flex-1 truncate">{scene.text}</p>
                <span className="text-emerald-400 text-xs font-mono">~{(scene.audioDurationMs / 1000).toFixed(1)}초</span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    
    // Higgsfield 모드: TTS 음성 파일 표시
    if (!timeline?.fullAudioPath) return null;
    if (currentStep === 'idle' || currentStep === 'script') return null;
    if (!timeline) return null;

    // 현재 splitScenes와 timeline.scenes가 다른지 확인 (수정되었는지)
    const isModified = splitScenes.length > 0 && (
      splitScenes.length !== timeline.scenes.length ||
      splitScenes.some((s, i) => s.text !== timeline.scenes[i]?.text)
    );

    return (
      <div className="bg-gray-900 rounded-xl p-5 mb-6 border border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">🎙️ 생성된 TTS 음성</h3>
          <div className="flex items-center gap-2">
            {/* 음성 재생성 버튼 */}
            {isModified && (
              <button
                onClick={regenerateAudio}
                disabled={isProcessing}
                className="text-sm bg-orange-600 hover:bg-orange-500 disabled:bg-gray-700 text-white px-3 py-1 rounded-lg flex items-center gap-1"
              >
                🔄 음성 재생성
              </button>
            )}
            {currentStep === 'scenes' && !showAudioAdjust && (
              <button
                onClick={initAudioAdjustments}
                className="text-sm bg-purple-600 hover:bg-purple-500 text-white px-3 py-1 rounded-lg"
              >
                🎚️ 길이 조절
              </button>
            )}
          </div>
        </div>
        
        {/* 수정 경고 메시지 */}
        {isModified && (
          <div className="bg-orange-900/30 border border-orange-500/50 rounded-lg p-3 mb-4">
            <p className="text-orange-300 text-sm">
              ⚠️ <strong>씬이 수정되었습니다!</strong> 현재 음성은 이전 씬 구조로 생성되어 있습니다.
              <br />
              <span className="text-orange-400/80">→ "음성 재생성" 버튼을 눌러 수정된 씬에 맞는 음성을 다시 생성하세요.</span>
            </p>
          </div>
        )}

        {/* 음성 길이 조절 모드 */}
        {showAudioAdjust && (
          <div className="bg-purple-900/30 border border-purple-500/30 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-purple-300 font-medium">🎚️ 씬별 음성 길이 조절</h4>
              <div className="text-sm text-purple-400">
                총 {(getTotalAdjustedDuration() / 1000).toFixed(1)}초
                <span className="text-gray-500 ml-2">
                  (원본: {((timeline.totalDurationMs || 0) / 1000).toFixed(1)}초)
                </span>
                  </div>
                  </div>
            
            <p className="text-gray-400 text-xs mb-4">
              💡 각 씬의 음성 길이를 4~8초 사이로 조절하면 AI 영상 생성에 최적화됩니다.
            </p>

            <div className="space-y-3 max-h-60 overflow-y-auto mb-4">
              {timeline.scenes.filter(s => s.audioPath).map(scene => {
                const original = scene.audioDurationMs;
                const adjusted = audioAdjustments[scene.id] || original;
                const isInRange = adjusted >= 4000 && adjusted <= 8000;
                
                return (
                  <div key={scene.id} className="bg-gray-800 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white text-sm">씬 {scene.id}</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-mono ${isInRange ? 'text-green-400' : 'text-yellow-400'}`}>
                          {(adjusted / 1000).toFixed(1)}초
                        </span>
                        {!isInRange && <span className="text-xs text-yellow-500">⚠️</span>}
                  </div>
                  </div>
                      <input
                      type="range"
                      min={Math.max(2000, original * 0.5)}
                      max={Math.min(12000, original * 2)}
                      step={100}
                      value={adjusted}
                      onChange={(e) => updateAudioAdjustment(scene.id, parseInt(e.target.value))}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>느리게</span>
                      <span className="text-gray-600">원본: {(original / 1000).toFixed(1)}초</span>
                      <span>빠르게</span>
                      </div>
                  </div>
                );
              })}
                  </div>
                  
            <div className="flex gap-2 justify-end">
                <button
                onClick={() => setShowAudioAdjust(false)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm"
              >
                취소
                        </button>
                <button
                onClick={applyAudioAdjustments}
                disabled={isProcessing}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 text-white rounded-lg text-sm"
              >
                {isProcessing ? '처리 중...' : '적용 및 합치기'}
              </button>
                  </div>
                  </div>
              )}

        <div className="bg-gray-950 rounded-lg p-4 mb-4">
          <p className="text-gray-400 text-sm mb-2">▶️ 전체 음성 ({((timeline.totalDurationMs || 0) / 1000).toFixed(1)}초)</p>
          <audio src={timeline.fullAudioPath} controls className="w-full h-10" />
              </div>

        <div className="space-y-2">
          <p className="text-gray-400 text-sm">🎵 씬별 음성 (개별 재생 가능)</p>
          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {timeline.scenes.filter(s => s.audioPath).map((scene) => (
              <div key={scene.id} className="bg-gray-800 rounded-lg p-4">
                {editingSceneId === scene.id ? (
                  // 편집 모드
                  <div className="space-y-3">
            <div>
                      <label className="text-xs text-gray-500 block mb-1">텍스트</label>
                      <textarea
                        value={editedSceneText}
                        onChange={(e) => setEditedSceneText(e.target.value)}
                        className="w-full h-20 bg-gray-900 border border-gray-700 rounded p-2 text-sm text-white resize-none"
                      />
                    </div>
                    <div className="flex gap-2 justify-end">
                    <button
                        onClick={cancelEditScene}
                        className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs"
                      >
                        취소
                    </button>
                    <button
                        onClick={() => saveEditedScene(true, false)}
                        disabled={isProcessing}
                        className="px-3 py-1 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 text-white rounded text-xs"
                      >
                        {isProcessing ? '처리중...' : '저장 + 음성 재생성'}
                    </button>
              </div>
            </div>
                ) : (
                  // 보기 모드
                  <div className="space-y-2">
                    {/* 씬 헤더 */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                          {scene.id}
                        </span>
                        <span className="text-white text-sm font-medium">씬 {scene.id}</span>
                        <span className="text-gray-500 text-xs">({(scene.audioDurationMs / 1000).toFixed(1)}초)</span>
                  </div>
                      {currentStep === 'scenes' && (
                    <button
                          onClick={() => startEditScene(scene)}
                          className="text-xs text-blue-400 hover:text-blue-300 px-2 py-1 bg-blue-600/20 rounded"
                        >
                          ✏️ 수정
                    </button>
                      )}
                  </div>
                    
                    {/* 텍스트 */}
                    <p className="text-gray-400 text-sm bg-gray-900 rounded p-2">{scene.text}</p>
                    
                    {/* 개별 오디오 플레이어 */}
                    <audio
                      src={scene.audioPath}
                      controls
                      className="w-full h-10"
                    />
                      </div>
                )}
                  </div>
                      ))}
                    </div>
                  </div>
                </div>
    );
  };

  // 씬 영상 미리보기 (프롬프트 수정 가능)
  const SceneVideoPreview = () => {
    const hasVideos = timeline?.scenes.some(s => s.videoPath || s.adjustedVideoPath || s.videoStatus === 'generating');
    if (!hasVideos || currentStep === 'idle' || currentStep === 'script' || currentStep === 'audio') return null;

    // 사용된 AI 정보 (현재 선택된 videoAI 사용)
    const getHiggsfieldModelLabel = () => {
      switch (higgsfieldModel) {
        case 'seedance-1.5': return 'Seedance 1.5';
        case 'kling-2.6': return 'Kling 2.6';
        case 'wan-2.6': return 'Wan 2.6';
        case 'minimax-hailuo': return 'MiniMax Hailuo';
        default: return 'Seedance';
      }
    };
    
    const aiLabel = videoAI === 'veo' ? 'Google Veo 3.1' : `Higgsfield · ${getHiggsfieldModelLabel()}`;
    const aiColor = videoAI === 'veo' ? 'text-emerald-400 bg-emerald-500/20' : 'text-purple-400 bg-purple-500/20';
    const aiIcon = videoAI === 'veo' ? '🎙️' : '🎬';

    return (
      <div className="bg-gray-900 rounded-xl p-5 mb-6 border border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">🎬 씬별 영상</h3>
          <span className={`text-xs px-2 py-1 rounded-full ${aiColor} font-medium`}>
            {aiIcon} {aiLabel}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {timeline?.scenes.map((scene) => {
            const videoPath = scene.adjustedVideoPath || scene.videoPath;
            const isExpanded = expandedScene === scene.id;
            const isEditing = editingSceneId === scene.id;

            return (
              <div 
                key={scene.id} 
                className={`bg-gray-800 rounded-lg overflow-hidden transition-all ${
                  isExpanded ? 'md:col-span-2 lg:col-span-3' : ''
                }`}
              >
                {/* 헤더 */}
                <div className="p-3 border-b border-gray-700 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                      {scene.id}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      scene.videoStatus === 'completed' || scene.videoStatus === 'adjusted' 
                        ? 'bg-emerald-500/20 text-emerald-400' 
                        : scene.videoStatus === 'generating' 
                        ? 'bg-yellow-500/20 text-yellow-400' 
                        : scene.videoStatus === 'failed'
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-gray-700 text-gray-400'
                    }`}>
                      {scene.videoStatus === 'adjusted' ? '보정됨' : 
                       scene.videoStatus === 'completed' ? '완료' :
                       scene.videoStatus === 'generating' ? '생성중' :
                       scene.videoStatus === 'failed' ? '실패' : '대기'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {(currentStep === 'scenes' || currentStep === 'adjust') && !isEditing && (
                    <button
                        onClick={() => startEditScene(scene)}
                        className="text-xs text-blue-400 hover:text-blue-300"
                      >
                        ✏️ 수정
                    </button>
                    )}
                    <button
                      onClick={() => setExpandedScene(isExpanded ? null : scene.id)}
                      className="text-gray-400 hover:text-white text-sm"
                    >
                      {isExpanded ? '축소' : '확대'}
                    </button>
                  </div>
                </div>

                {/* 편집 모드 */}
                {isEditing ? (
                  <div className="p-4 space-y-3">
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">텍스트</label>
                      <textarea
                        value={editedSceneText}
                        onChange={(e) => setEditedSceneText(e.target.value)}
                        className="w-full h-16 bg-gray-900 border border-gray-700 rounded p-2 text-sm text-white resize-none"
                      />
                    </div>
                      <div>
                      <label className="text-xs text-gray-500 block mb-1">프롬프트 (영어)</label>
                      <textarea
                        value={editedScenePrompt}
                        onChange={(e) => setEditedScenePrompt(e.target.value)}
                        placeholder="AI 영상 생성에 사용될 프롬프트를 입력하세요..."
                        className="w-full h-24 bg-gray-900 border border-gray-700 rounded p-2 text-sm text-white resize-none"
                      />
                      </div>
                    <div className="flex gap-2 justify-end flex-wrap">
                    <button
                        onClick={cancelEditScene}
                        className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs"
                      >
                        취소
                    </button>
                    <button
                        onClick={() => saveEditedScene(false, false)}
                        disabled={isProcessing}
                        className="px-3 py-1 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 text-white rounded text-xs"
                      >
                        저장만
                    </button>
                    <button
                        onClick={() => saveEditedScene(true, false)}
                        disabled={isProcessing}
                        className="px-3 py-1 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 text-white rounded text-xs"
                      >
                        + 음성 재생성
                    </button>
                    <button
                        onClick={() => saveEditedScene(false, true)}
                        disabled={isProcessing}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white rounded text-xs"
                      >
                        + 영상 재생성
                    </button>
                  </div>
                      </div>
                ) : (
                  <>
                    {/* 비디오 */}
                    {videoPath ? (
                      <div className={`bg-black ${isExpanded ? 'aspect-[9/16] max-h-[500px]' : 'aspect-video'}`}>
                        <video src={videoPath} controls className="w-full h-full object-contain" />
                  </div>
                    ) : (
                      <div className="aspect-video bg-gray-900 flex items-center justify-center">
                        {scene.videoStatus === 'generating' ? (
                          <div className="text-center">
                            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                            <p className="text-gray-500 text-sm">생성 중...</p>
                </div>
                        ) : scene.videoStatus === 'failed' ? (
                          <div className="text-center p-4">
                            <p className="text-red-400 text-sm mb-2">❌ 실패</p>
                            {scene.errorMessage && <p className="text-gray-600 text-xs">{scene.errorMessage}</p>}
                          </div>
                        ) : (
                          <p className="text-gray-600 text-sm">대기 중</p>
                        )}
                </div>
              )}

                    {/* 정보 */}
                    <div className="p-3 space-y-2">
                      <p className="text-gray-400 text-xs line-clamp-2">💬 {scene.text}</p>
                      
                      {/* 🎙️ 음성 플레이어 */}
                      {scene.audioPath && (
                        <div className="bg-gray-900 rounded-lg p-2">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs text-gray-500">🎙️ 음성</span>
                            <span className="text-xs text-gray-600">{(scene.audioDurationMs / 1000).toFixed(1)}초</span>
                          </div>
                          <audio 
                            src={scene.audioPath} 
                            controls 
                            className="w-full h-8"
                            style={{ filter: 'invert(1) hue-rotate(180deg)' }}
                          />
                      </div>
                      )}
                      
                      {scene.prompt && (
                        <details className="text-xs">
                          <summary className="text-gray-500 cursor-pointer hover:text-gray-400">🎨 프롬프트 보기</summary>
                          <p className="mt-2 text-gray-600 bg-gray-900 p-2 rounded text-xs leading-relaxed max-h-32 overflow-y-auto">
                            {scene.prompt}
                          </p>
                        </details>
                      )}
                      <div className="flex gap-4 text-xs text-gray-600">
                        <span>🎙️ {(scene.audioDurationMs / 1000).toFixed(1)}초</span>
                        {scene.videoDurationMs && <span>🎬 {(scene.videoDurationMs / 1000).toFixed(1)}초</span>}
                        {scene.adjustmentType && <span className="text-purple-400">🔧 {scene.adjustmentType}</span>}
                  </div>
                </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // 조립된 영상 미리보기
  const ComposedVideoPreview = () => {
    if (!timeline?.fullVideoPath || currentStep === 'completed') return null;
    if (currentStep !== 'export' && currentStep !== 'compose') return null;

    return (
      <div className="bg-gray-900 rounded-xl p-5 mb-6 border border-gray-800">
        <h3 className="text-lg font-bold text-white mb-4">🎞️ 조립된 영상</h3>
        <div className="bg-black rounded-xl overflow-hidden max-w-md mx-auto">
          <video src={timeline.fullVideoPath} controls className="w-full aspect-[9/16] object-contain" />
                  </div>
                </div>
    );
  };

  const LogViewer = () => (
    <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
      <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
        📋 로그
        <button onClick={() => setLogs([])} className="text-xs text-gray-500 hover:text-gray-400 font-normal">(지우기)</button>
      </h3>
      <div className="bg-black rounded-lg p-3 h-40 overflow-y-auto font-mono text-xs">
        {logs.map((log, i) => <div key={i} className="text-gray-400">{log}</div>)}
        {logs.length === 0 && <div className="text-gray-600">로그가 여기에 표시됩니다...</div>}
            </div>
    </div>
  );

  // ============================================
  // Render
  // ============================================

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500 mb-2">
            🎬 Shorts Baksa
          </h1>
          <p className="text-gray-400">씬 단위 자동 생성 → 타임라인 조립</p>
        </div>

        <StepIndicator />

        {/* Input Form */}
        {(currentStep === 'idle' || currentStep === 'topic') && (
          <div className="bg-gray-900/80 backdrop-blur rounded-2xl p-6 mb-6 border border-gray-800">
            <h2 className="text-xl font-bold text-white mb-6">📝 쇼츠 설정</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {/* 카테고리 먼저 */}
              <div>
                <label className="block text-gray-400 text-sm mb-2">카테고리</label>
                <div className="flex gap-2">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:border-blue-500 focus:outline-none"
                >
                  {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
                    <button
                    onClick={findTopics}
                    disabled={isLoadingTopics}
                    className="px-4 py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 text-white rounded-lg font-medium transition-colors whitespace-nowrap"
                  >
                    {isLoadingTopics ? '🔄' : '🔍'} 주제찾기
                    </button>
                </div>
              </div>

              {/* 목표 길이 */}
                  <div>
                <label className="block text-gray-400 text-sm mb-2">목표 길이</label>
                <div className="flex gap-2">
                  {[30, 60].map(dur => (
                    <button
                      key={dur}
                      onClick={() => setTargetDuration(dur as 30 | 60)}
                      className={`flex-1 py-3 rounded-lg font-medium transition-colors ${
                        targetDuration === dur ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                      }`}
                    >
                      {dur}초
                    </button>
                  ))}
                  </div>
                </div>

              {/* 주제 입력 */}
              <div className="md:col-span-2">
                <label className="block text-gray-400 text-sm mb-2">주제</label>
              <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="예: 50대 무릎 건강을 위한 3가지 습관"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                />
            </div>

              <div>
                <label className="block text-gray-400 text-sm mb-2">스크립트 AI</label>
                <select
                  value={scriptAI}
                  onChange={(e) => setScriptAI(e.target.value as any)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="claude">Claude Opus 4</option>
                  <option value="gpt-5">GPT 5.2</option>
                  <option value="gemini">Gemini 3 Pro</option>
                </select>
              </div>

                  <div>
                <label className="block text-gray-400 text-sm mb-2">영상 AI</label>
                <select
                  value={videoAI}
                  onChange={(e) => setVideoAI(e.target.value as any)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="veo">🎙️ Google Veo 3.1 (영상+음성 동시)</option>
                  <option value="higgsfield">🔊 Higgsfield 플랫폼 (영상→TTS합성)</option>
                </select>
                {/* AI별 특징 안내 */}
                <p className={`text-xs mt-2 ${videoAI === 'veo' ? 'text-emerald-400' : 'text-blue-400'}`}>
                  {videoAI === 'veo' 
                    ? '✨ Veo 3: 텍스트로 영상+음성 동시 생성 (TTS 불필요)'
                    : '🔧 Higgsfield: 영상 생성 후 TTS 음성 합성'}
                </p>
                  </div>

              {/* Higgsfield 모델 선택 */}
              {videoAI === 'higgsfield' && (
                <div>
                  <label className="block text-gray-400 text-sm mb-2">Higgsfield 모델</label>
                  <select
                    value={higgsfieldModel}
                    onChange={(e) => setHiggsfieldModel(e.target.value as any)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:border-purple-500 focus:outline-none"
                  >
                    <option value="seedance-1.5">🎬 Seedance 1.5 Pro (ByteDance)</option>
                    <option value="kling-2.6">🎥 Kling 2.6 (Kuaishou)</option>
                    <option value="wan-2.6">🌊 Wan 2.6 (Alibaba)</option>
                    <option value="minimax-hailuo">🌟 MiniMax Hailuo</option>
                  </select>
                  <p className="text-xs mt-2 text-purple-400">
                    {higgsfieldModel === 'seedance-1.5' && '🎬 Seedance: 빠른 생성, 안정적 품질'}
                    {higgsfieldModel === 'kling-2.6' && '🎥 Kling: 높은 품질, 자연스러운 움직임'}
                    {higgsfieldModel === 'wan-2.6' && '🌊 Wan: 창의적 스타일, 다양한 표현'}
                    {higgsfieldModel === 'minimax-hailuo' && '🌟 Hailuo: 빠른 속도, 효율적 생성'}
                  </p>
                </div>
              )}

              <div className="md:col-span-2 flex gap-6">
                <label className="flex items-center gap-2 text-gray-400 cursor-pointer">
                  <input type="checkbox" checked={enableSubtitles} onChange={(e) => setEnableSubtitles(e.target.checked)} className="w-4 h-4 rounded" />
                  <span>자막 추가</span>
                </label>
                <label className="flex items-center gap-2 text-gray-400 cursor-pointer">
                  <input type="checkbox" checked={enableBGM} onChange={(e) => setEnableBGM(e.target.checked)} className="w-4 h-4 rounded" />
                  <span>BGM 추가</span>
                </label>
                </div>
              </div>

            {/* 🔍 주제찾기 결과 */}
            {topicRecommendations.length > 0 && (
              <div className="mb-6 p-4 bg-purple-900/20 border border-purple-500/30 rounded-xl">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-purple-300 font-bold flex items-center gap-2">
                    🔍 추천 주제 ({category})
                  </h3>
            <button
                    onClick={clearTopicSearch}
                    className="text-xs text-gray-500 hover:text-gray-400"
                  >
                    닫기 ✕
            </button>
        </div>
                <div className="space-y-2">
                  {topicRecommendations.map((rec, idx) => (
                    <div 
                      key={idx}
                      onClick={() => selectTopic(rec.topic)}
                      className={`p-3 rounded-lg cursor-pointer transition-all ${
                        topic === rec.topic 
                          ? 'bg-purple-600 ring-2 ring-purple-400' 
                          : 'bg-gray-800 hover:bg-gray-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-white font-medium mb-1">{rec.topic}</p>
                          <p className="text-gray-400 text-xs">{rec.reason}</p>
                          {rec.hook && (
                            <p className="text-purple-400 text-xs mt-1 italic">&quot;{rec.hook}&quot;</p>
                          )}
          </div>
                        {topic === rec.topic && (
                          <span className="text-purple-300 text-lg">✓</span>
                        )}
            </div>
            </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={startPipeline}
              disabled={isProcessing || !topic.trim()}
              className="w-full py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:from-gray-700 disabled:to-gray-700 text-white font-bold rounded-xl transition-all disabled:cursor-not-allowed"
            >
              {isProcessing ? '처리 중...' : '🚀 쇼츠 생성 시작'}
            </button>
                  </div>
        )}

        {/* 결과물 미리보기 */}
        <ScriptPreview />
        <SplitEditor />
        <AudioPreview />
        <SceneVideoPreview />
        <ComposedVideoPreview />

        {/* Action Buttons */}
        {currentStep !== 'idle' && currentStep !== 'completed' && currentStep !== 'split' && (
          <div className="bg-gray-900/80 backdrop-blur rounded-2xl p-6 mb-6 border border-gray-800">
            <div className="flex gap-3">
              {/* 이전 단계로 버튼 */}
              <button 
                onClick={goToPreviousStep} 
                disabled={isProcessing}
                className="px-4 py-4 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-white font-medium rounded-xl transition-colors"
                title="이전 단계로 돌아가기"
              >
                ⬅️
              </button>
              
              {/* 다음 단계 버튼 */}
              <div className="flex-1">
                {currentStep === 'audio' && (
                  <button onClick={generateAudio} disabled={isProcessing} className="w-full py-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:from-gray-700 disabled:to-gray-700 text-white font-bold rounded-xl">
                    {isProcessing 
                      ? (videoAI === 'veo' ? '⏳ 준비 중...' : '🎙️ TTS 생성 중...')
                      : (videoAI === 'veo' ? '🎬 다음: 씬 영상+음성 생성' : '🎙️ 다음: TTS 음성 생성')
                    }
                  </button>
                )}
                {currentStep === 'scenes' && (
                  <button onClick={generateScenes} disabled={isProcessing} className="w-full py-4 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 disabled:from-gray-700 disabled:to-gray-700 text-white font-bold rounded-xl">
                    {isProcessing ? '🎬 씬 생성 중...' : '🎬 다음: 씬 영상 생성'}
                  </button>
                )}
                {currentStep === 'adjust' && (
                  <button onClick={adjustVideos} disabled={isProcessing} className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:from-gray-700 disabled:to-gray-700 text-white font-bold rounded-xl">
                    {isProcessing ? '🔧 보정 중...' : '🔧 다음: 영상 길이 보정'}
                  </button>
                )}
                {currentStep === 'compose' && (
                  <button onClick={composeTimeline} disabled={isProcessing} className="w-full py-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:from-gray-700 disabled:to-gray-700 text-white font-bold rounded-xl">
                    {isProcessing ? '🎞️ 조립 중...' : '🎞️ 다음: 타임라인 조립'}
                  </button>
                )}
                {currentStep === 'export' && (
                  <button onClick={exportFinal} disabled={isProcessing} className="w-full py-4 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 disabled:from-gray-700 disabled:to-gray-700 text-white font-bold rounded-xl">
                    {isProcessing ? '📦 내보내기 중...' : '📦 다음: 최종 내보내기'}
                  </button>
                    )}
                  </div>
                </div>
            </div>
          )}

        {/* Completed */}
        {currentStep === 'completed' && timeline?.fullVideoPath && (
          <div className="bg-gradient-to-r from-emerald-900/50 to-green-900/50 rounded-2xl p-6 mb-6 border border-emerald-500/30">
            <h2 className="text-2xl font-bold text-emerald-400 mb-4 text-center">🎉 쇼츠 완성!</h2>
            <div className="bg-black rounded-xl overflow-hidden mb-4 max-w-md mx-auto">
              <video src={timeline.fullVideoPath} controls className="w-full aspect-[9/16] object-contain" />
          </div>
            <div className="flex gap-4 max-w-md mx-auto">
              <a href={timeline.fullVideoPath} download className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg text-center">
                📥 다운로드
              </a>
              <button
                onClick={() => {
                  setCurrentStep('idle');
                  setTimeline(null);
                  setTopic('');
                  setLogs([]);
                }}
                className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg"
              >
                🔄 새로 만들기
              </button>
          </div>
          </div>
        )}

        {error && (
          <div className="bg-red-900/50 border border-red-500/30 rounded-xl p-4 mb-6">
            <p className="text-red-400">❌ {error}</p>
        </div>
        )}

        <LogViewer />
      </div>
    </main>
  );
}
