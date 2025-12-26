"use client";

import { useState, useEffect, useCallback, use, useRef } from "react";
import Link from "next/link";
import type { Job } from "@/types";

interface JobDetailPageProps {
  params: Promise<{ id: string }>;
}

interface RenderLog {
  time: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'progress';
}

export default function JobDetailPage({ params }: JobDetailPageProps) {
  const { id } = use(params);
  const [job, setJob] = useState<Job | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // 업로드 상태
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  
  // 렌더링 로그 상태
  const [renderLogs, setRenderLogs] = useState<RenderLog[]>([]);
  const [isCheckingRender, setIsCheckingRender] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const prevStatusRef = useRef<string | null>(null);
  
  // 클립 합치기 상태
  const [isMerging, setIsMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);

  // 로그 추가 헬퍼
  const addLog = useCallback((message: string, type: RenderLog['type'] = 'info') => {
    const time = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setRenderLogs(prev => [...prev, { time, message, type }]);
    
    // 자동 스크롤
    setTimeout(() => {
      if (logContainerRef.current) {
        logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
      }
    }, 100);
  }, []);

  // 작업 정보 로드
  const fetchJob = useCallback(async () => {
    try {
      const response = await fetch(`/api/jobs/${id}`);
      const data = await response.json();

      if (data.success) {
        const newJob = data.job;
        
        // 상태 변화 감지하여 로그 추가
        if (prevStatusRef.current !== newJob.status) {
          if (newJob.status === 'script') {
            addLog('📝 스크립트 생성을 시작합니다...', 'info');
          } else if (newJob.status === 'audio' && prevStatusRef.current === 'script') {
            addLog('✅ 스크립트 생성 완료!', 'success');
            addLog('🎤 TTS 음성 생성을 시작합니다...', 'info');
          } else if (newJob.status === 'render' && prevStatusRef.current === 'audio') {
            addLog('✅ 음성 생성 완료!', 'success');
            addLog('🎬 영상 렌더링을 시작합니다...', 'info');
            
            // 멀티클립 확인
            if (newJob.brewJobId?.startsWith('multiclip|')) {
              const parts = newJob.brewJobId.split('|');
              const clipIds = parts[3]?.split(',').filter(Boolean) || [];
              addLog(`🎬 멀티클립 모드: ${clipIds.length}개 클립 생성 예정`, 'info');
              addLog('⏳ 각 클립 생성에 1-3분이 소요됩니다...', 'warning');
            }
          } else if (newJob.status === 'upload') {
            addLog('✅ 영상 렌더링 완료!', 'success');
            addLog('📤 YouTube 업로드 중...', 'info');
          } else if (newJob.status === 'completed') {
            addLog('🎉 모든 작업이 완료되었습니다!', 'success');
          } else if (newJob.status === 'failed') {
            addLog(`❌ 오류 발생: ${newJob.errorMessage || '알 수 없는 오류'}`, 'error');
          }
          
          prevStatusRef.current = newJob.status;
        }
        
        setJob(newJob);
        setError(null);
      } else {
        setError(data.error || "작업 정보를 불러올 수 없습니다.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "네트워크 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [id, addLog]);

  // 렌더링 상태 확인 (check-and-upload API 호출)
  const checkRenderStatus = useCallback(async () => {
    if (!job || job.status !== 'render' || isCheckingRender) return;
    
    setIsCheckingRender(true);
    addLog('🔍 렌더링 상태를 확인 중...', 'progress');
    
    try {
      const response = await fetch('/api/pipeline/check-and-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        if (data.message.includes('렌더링 중') || data.message.includes('processing')) {
          // 멀티클립 진행률 파싱
          const progressMatch = data.message.match(/(\d+)\/(\d+)/);
          if (progressMatch) {
            const [, completed, total] = progressMatch;
            addLog(`📊 멀티클립 진행: ${completed}/${total} 완료 (${Math.round(parseInt(completed)/parseInt(total)*100)}%)`, 'progress');
          } else {
            addLog('⏳ AI가 영상을 생성하고 있습니다...', 'progress');
          }
        } else if (data.job?.status === 'completed') {
          addLog('🎉 렌더링이 완료되었습니다!', 'success');
        }
        
        if (data.job) {
          setJob(data.job);
        }
      } else {
        addLog(`⚠️ 상태 확인 실패: ${data.message || '알 수 없는 오류'}`, 'warning');
      }
    } catch (err) {
      addLog(`❌ 상태 확인 오류: ${err instanceof Error ? err.message : '네트워크 오류'}`, 'error');
    } finally {
      setIsCheckingRender(false);
    }
  }, [job, isCheckingRender, addLog]);

  // 초기 로드
  useEffect(() => {
    fetchJob();
  }, [fetchJob]);

  // 렌더링 중일 때 자동 새로고침 (10초마다)
  useEffect(() => {
    if (!job || job.status === 'completed' || job.status === 'failed') return;
    
    const interval = setInterval(() => {
      if (job.status === 'render') {
        checkRenderStatus();
      } else {
        fetchJob();
      }
    }, 10000); // 10초마다
    
    return () => clearInterval(interval);
  }, [job, fetchJob, checkRenderStatus]);

  // YouTube 업로드
  const handleUpload = async () => {
    if (!job?.videoUrl) return;

    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(false);

    try {
      const response = await fetch("/api/youtube/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: job.id,
          videoUrl: job.videoUrl,
          title: `${job.topic} #shorts`,
          description: `${job.topic}\n\n#shorts #50대 #건강정보 #생활꿀팁`,
          tags: [job.topic, job.category || "건강", "50대", "shorts"],
          privacyStatus: "public",
        }),
      });

      const data = await response.json();

      if (data.success) {
        setUploadSuccess(true);
        setJob(data.job);
      } else {
        setUploadError(data.error || data.details || "업로드에 실패했습니다.");
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "업로드 중 오류가 발생했습니다.");
    } finally {
      setIsUploading(false);
    }
  };

  // 클립 합치기 핸들러
  const handleMergeClips = async () => {
    if (!job) return;
    
    setIsMerging(true);
    setMergeError(null);
    addLog('🔗 클립 합치기를 시작합니다...', 'info');

    try {
      const response = await fetch('/api/pipeline/merge-clips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id }),
      });

      const data = await response.json();

      if (data.success) {
        addLog('✅ 클립 합치기 완료!', 'success');
        setJob(data.job);
        await fetchJob(); // 최신 상태 반영
      } else {
        setMergeError(data.error || '클립 합치기에 실패했습니다.');
        addLog(`❌ 합치기 실패: ${data.error}`, 'error');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '클립 합치기 중 오류가 발생했습니다.';
      setMergeError(errorMsg);
      addLog(`❌ 오류: ${errorMsg}`, 'error');
    } finally {
      setIsMerging(false);
    }
  };

  // 클립이 모두 완료되었는지 확인
  const allClipsCompleted = job?.clips && job.clips.length > 0 && 
    job.clips.every(clip => clip.status === 'completed' || clip.status === 'failed');
  
  const completedClipsCount = job?.clips?.filter(c => c.status === 'completed').length || 0;
  const totalClipsCount = job?.clips?.length || 0;

  // 상태 배지
  const getStatusBadge = (status: Job["status"]) => {
    const statusConfig: Record<string, { label: string; color: string }> = {
      script: { label: "스크립트 생성", color: "bg-blue-100 text-blue-700" },
      audio: { label: "음성 생성", color: "bg-purple-100 text-purple-700" },
      render: { label: "영상 렌더링", color: "bg-yellow-100 text-yellow-700" },
      upload: { label: "업로드 중", color: "bg-orange-100 text-orange-700" },
      completed: { label: "완료", color: "bg-green-100 text-green-700" },
      failed: { label: "실패", color: "bg-red-100 text-red-700" },
    };
    
    const config = statusConfig[status] || { label: status, color: "bg-gray-100 text-gray-700" };
    return (
      <span className={`px-3 py-1 rounded-full text-sm font-medium ${config.color}`}>
        {config.label}
      </span>
    );
  };

  // 로딩 상태
  if (isLoading) {
    return (
      <div className="container max-w-4xl mx-auto py-12">
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-[var(--color-primary)]/30 border-t-[var(--color-primary)] rounded-full animate-spin mx-auto mb-4" />
            <p className="text-[var(--color-text-muted)]">불러오는 중...</p>
          </div>
        </div>
      </div>
    );
  }

  // 에러 상태
  if (error || !job) {
    return (
      <div className="container max-w-4xl mx-auto py-12">
        <div className="card text-center py-12">
          <p className="text-5xl mb-4">😢</p>
          <p className="text-xl text-red-600 mb-4">{error || "작업을 찾을 수 없습니다."}</p>
          <Link href="/jobs" className="text-[var(--color-primary)] hover:underline">
            ← 작업 목록으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  // 메인 렌더링
  return (
    <div className="container max-w-4xl mx-auto py-8 px-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <Link 
          href="/jobs" 
          className="text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors"
        >
          ← 목록으로
        </Link>
        {getStatusBadge(job.status)}
      </div>

      {/* 제목 */}
      <h1 className="text-2xl md:text-3xl font-bold text-[var(--color-text)] mb-2">
        {job.topic}
      </h1>
      <p className="text-[var(--color-text-muted)] mb-8">
        {new Date(job.createdAt).toLocaleDateString("ko-KR", {
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
        {job.category && ` · ${job.category}`}
      </p>

      {/* 📊 작업 단계 (멀티클립 모드) */}
      {job.steps && job.steps.length > 0 && (
        <section className="card mb-8">
          <h2 className="text-xl font-bold mb-4">📊 작업 단계</h2>
          <div className="space-y-3">
            {job.steps.map((step, index) => (
              <div 
                key={step.id} 
                className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                  step.status === 'completed' ? 'bg-green-50 border border-green-200' :
                  step.status === 'processing' ? 'bg-blue-50 border border-blue-200 animate-pulse' :
                  step.status === 'failed' ? 'bg-red-50 border border-red-200' :
                  'bg-gray-50 border border-gray-200'
                }`}
              >
                <div className="text-2xl">
                  {step.status === 'completed' && '✅'}
                  {step.status === 'processing' && '⏳'}
                  {step.status === 'failed' && '❌'}
                  {step.status === 'pending' && '⬜'}
                </div>
                <div className="flex-1">
                  <p className={`font-medium ${
                    step.status === 'completed' ? 'text-green-700' :
                    step.status === 'processing' ? 'text-blue-700' :
                    step.status === 'failed' ? 'text-red-700' :
                    'text-gray-500'
                  }`}>
                    {step.name}
                  </p>
                  {step.result && (
                    <p className="text-xs text-gray-500 mt-1">
                      {step.id === 'split' && step.result.sectionCount && 
                        `${step.result.sectionCount}개 섹션 (오디오 ${Math.round(step.result.audioDuration)}초)`}
                    </p>
                  )}
                </div>
                {step.endTime && (
                  <span className="text-xs text-gray-400">
                    {new Date(step.endTime).toLocaleTimeString("ko-KR", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </span>
                )}
              </div>
            ))}
          </div>
          
          {/* 클립 진행 상황 */}
          {job.clips && job.clips.length > 0 && (
            <div className="mt-6 p-4 bg-purple-50 border border-purple-200 rounded-lg">
              <h3 className="font-semibold text-purple-800 mb-3">
                🎬 클립 상태 ({completedClipsCount}/{totalClipsCount} 완료)
              </h3>
              
              {/* 클립 상태 그리드 */}
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-4">
                {job.clips.map((clip, index) => (
                  <div 
                    key={index}
                    className={`aspect-video rounded-lg flex items-center justify-center text-sm font-medium ${
                      clip.status === 'completed' ? 'bg-green-200 text-green-800' :
                      clip.status === 'processing' ? 'bg-blue-200 text-blue-800 animate-pulse' :
                      clip.status === 'failed' ? 'bg-red-200 text-red-800' :
                      'bg-gray-200 text-gray-600'
                    }`}
                  >
                    {clip.status === 'completed' && '✓'}
                    {clip.status === 'processing' && '...'}
                    {clip.status === 'failed' && '✗'}
                    {clip.status === 'pending' && (index + 1)}
                  </div>
                ))}
              </div>
              
              {/* 진행 중 메시지 */}
              {job.status === 'render' && !allClipsCompleted && (
                <p className="text-xs text-purple-600 mb-4">
                  ⏳ 각 클립은 약 1-3분 소요됩니다. 렌더링 상태 확인 버튼을 눌러 진행 상황을 업데이트하세요.
                </p>
              )}
              
              {/* 클립 완료 후 합치기 버튼 */}
              {allClipsCompleted && !job.videoUrl && (
                <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-green-800 font-medium mb-3">
                    ✅ 모든 클립 렌더링이 완료되었습니다! ({completedClipsCount}개 성공)
                  </p>
                  <button
                    onClick={handleMergeClips}
                    disabled={isMerging || completedClipsCount === 0}
                    className="w-full py-3 px-6 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700
                             text-white font-bold rounded-lg shadow-lg hover:shadow-xl
                             transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed
                             flex items-center justify-center gap-2"
                  >
                    {isMerging ? (
                      <>
                        <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        클립 합치는 중...
                      </>
                    ) : (
                      <>🔗 클립 합치기 ({completedClipsCount}개 → 1개 영상)</>
                    )}
                  </button>
                  {mergeError && (
                    <p className="mt-2 text-sm text-red-600">❌ {mergeError}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}
      
      {/* 🎞️ 개별 클립 미리보기 (합치기 전) */}
      {job.clips && job.clips.some(c => c.status === 'completed' && c.videoUrl) && !job.videoUrl && (
        <section className="card mb-8">
          <h2 className="text-xl font-bold mb-4">🎞️ 개별 클립 미리보기</h2>
          <p className="text-sm text-gray-600 mb-4">
            각 클립을 확인한 후 위의 &quot;클립 합치기&quot; 버튼을 눌러 최종 영상을 생성하세요.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {job.clips.filter(clip => clip.status === 'completed' && clip.videoUrl).map((clip, index) => (
              <div key={index} className="bg-gray-900 rounded-lg overflow-hidden">
                <div className="relative" style={{ aspectRatio: "9/16" }}>
                  <video
                    src={clip.videoUrl}
                    controls
                    playsInline
                    preload="metadata"
                    className="w-full h-full object-contain"
                    style={{ backgroundColor: "#000" }}
                  />
                </div>
                <div className="p-3 bg-gray-800">
                  <p className="text-white text-sm font-medium mb-1">
                    클립 {clip.index + 1} ({clip.duration}초)
                  </p>
                  {clip.scriptSection && (
                    <p className="text-gray-400 text-xs line-clamp-2">{clip.scriptSection}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          {/* 실패한 클립 안내 */}
          {job.clips.some(c => c.status === 'failed') && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 text-sm">
                ⚠️ 일부 클립이 실패했습니다. 성공한 클립들만 합쳐집니다.
              </p>
            </div>
          )}
        </section>
      )}

      {/* 🎬 영상 미리보기 */}
      <section className="card mb-8">
        <h2 className="text-xl font-bold mb-4">🎬 영상 미리보기</h2>
        
        {job.videoUrl ? (
          <div className="space-y-6">
            {/* 합쳐진 최종 영상 */}
            <div>
              <h3 className="text-lg font-semibold mb-3 text-green-700">✅ 최종 영상</h3>
              <div className="bg-black rounded-lg overflow-hidden mb-4">
                <div className="relative mx-auto" style={{ maxWidth: "360px", aspectRatio: "9/16" }}>
                  <video
                    key={job.videoUrl}
                    src={job.videoUrl}
                    controls
                    playsInline
                    preload="auto"
                    className="w-full h-full object-contain"
                    style={{ backgroundColor: "#000" }}
                  />
                </div>
              </div>
              <div className="p-3 bg-gray-100 rounded-lg">
                <p className="text-sm text-gray-600 mb-1">📁 영상 파일:</p>
                <code className="text-xs text-gray-800 break-all">{job.videoUrl}</code>
              </div>
            </div>
            
            {/* 개별 클립들 (멀티클립 모드인 경우) */}
            {((job.clipUrls && job.clipUrls.length > 0) || (job.clips && job.clips.some(c => c.videoUrl))) && (
              <div>
                <h3 className="text-lg font-semibold mb-3 text-purple-700">
                  🎞️ 개별 클립 ({job.clips?.filter(c => c.status === 'completed').length || job.clipUrls?.length || 0}개)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {(job.clips || []).filter(clip => clip.status === 'completed' && clip.videoUrl).map((clip, index) => (
                    <div key={index} className="bg-gray-900 rounded-lg overflow-hidden">
                      <div className="relative" style={{ aspectRatio: "9/16" }}>
                        <video
                          src={clip.videoUrl}
                          controls
                          playsInline
                          preload="metadata"
                          className="w-full h-full object-contain"
                          style={{ backgroundColor: "#000" }}
                        />
                      </div>
                      <div className="p-3 bg-gray-800">
                        <p className="text-white text-sm font-medium mb-1">클립 {clip.index + 1}</p>
                        {clip.scriptSection && (
                          <p className="text-gray-400 text-xs line-clamp-2">{clip.scriptSection}</p>
                        )}
                      </div>
                    </div>
                  ))}
                  {/* clipUrls만 있고 clips가 없는 경우 (레거시) */}
                  {!job.clips && job.clipUrls?.map((clipUrl, index) => (
                    <div key={index} className="bg-gray-900 rounded-lg overflow-hidden">
                      <div className="relative" style={{ aspectRatio: "9/16" }}>
                        <video
                          src={clipUrl}
                          controls
                          playsInline
                          preload="metadata"
                          className="w-full h-full object-contain"
                          style={{ backgroundColor: "#000" }}
                        />
                      </div>
                      <div className="p-2 bg-gray-800 text-center">
                        <span className="text-xs text-gray-300">클립 {index + 1}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* 진행 상태 표시 */}
            <div className="p-6 bg-gradient-to-br from-blue-50 to-purple-50 border border-blue-200 rounded-lg">
              <div className="flex items-center gap-4 mb-4">
                <div className="relative">
                  <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-lg">🎬</span>
                  </div>
                </div>
                <div>
                  <p className="text-lg font-semibold text-blue-800">
                    {job.status === 'script' && '스크립트 생성 중...'}
                    {job.status === 'audio' && '음성 생성 중...'}
                    {job.status === 'render' && '영상 렌더링 중...'}
                    {job.status === 'upload' && 'YouTube 업로드 중...'}
                    {job.status === 'failed' && '작업 실패'}
                  </p>
                  <p className="text-sm text-blue-600">
                    {job.status === 'render' && job.brewJobId?.startsWith('multiclip|') 
                      ? '멀티클립 모드: 여러 클립을 생성하고 합치는 중입니다'
                      : '잠시만 기다려주세요'}
                  </p>
                </div>
              </div>
              
              {/* 진행 단계 표시 */}
              <div className="flex items-center justify-between text-sm mb-4">
                <div className={`flex flex-col items-center ${['script', 'audio', 'render', 'upload', 'completed'].includes(job.status) ? 'text-green-600' : 'text-gray-400'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-1 ${['script', 'audio', 'render', 'upload', 'completed'].includes(job.status) ? 'bg-green-100' : 'bg-gray-100'}`}>
                    {job.status === 'script' ? '⏳' : '✅'}
                  </div>
                  <span>스크립트</span>
                </div>
                <div className="flex-1 h-1 mx-2 bg-gray-200 rounded">
                  <div className={`h-full rounded transition-all duration-500 ${['audio', 'render', 'upload', 'completed'].includes(job.status) ? 'w-full bg-green-400' : job.status === 'script' ? 'w-1/2 bg-blue-400 animate-pulse' : 'w-0'}`} />
                </div>
                <div className={`flex flex-col items-center ${['audio', 'render', 'upload', 'completed'].includes(job.status) ? 'text-green-600' : 'text-gray-400'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-1 ${['audio', 'render', 'upload', 'completed'].includes(job.status) ? 'bg-green-100' : 'bg-gray-100'}`}>
                    {job.status === 'audio' ? '⏳' : ['render', 'upload', 'completed'].includes(job.status) ? '✅' : '🎤'}
                  </div>
                  <span>음성</span>
                </div>
                <div className="flex-1 h-1 mx-2 bg-gray-200 rounded">
                  <div className={`h-full rounded transition-all duration-500 ${['render', 'upload', 'completed'].includes(job.status) ? 'w-full bg-green-400' : job.status === 'audio' ? 'w-1/2 bg-blue-400 animate-pulse' : 'w-0'}`} />
                </div>
                <div className={`flex flex-col items-center ${['render', 'upload', 'completed'].includes(job.status) ? 'text-green-600' : 'text-gray-400'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-1 ${['upload', 'completed'].includes(job.status) ? 'bg-green-100' : job.status === 'render' ? 'bg-blue-100' : 'bg-gray-100'}`}>
                    {job.status === 'render' ? '⏳' : ['upload', 'completed'].includes(job.status) ? '✅' : '🎬'}
                  </div>
                  <span>렌더링</span>
                </div>
                <div className="flex-1 h-1 mx-2 bg-gray-200 rounded">
                  <div className={`h-full rounded transition-all duration-500 ${job.status === 'completed' ? 'w-full bg-green-400' : job.status === 'upload' ? 'w-1/2 bg-blue-400 animate-pulse' : 'w-0'}`} />
                </div>
                <div className={`flex flex-col items-center ${job.status === 'completed' ? 'text-green-600' : 'text-gray-400'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-1 ${job.status === 'completed' ? 'bg-green-100' : 'bg-gray-100'}`}>
                    {job.status === 'completed' ? '✅' : '🏁'}
                  </div>
                  <span>완료</span>
                </div>
              </div>
              
              {/* 수동 새로고침 버튼 */}
              {job.status === 'render' && (
                <button
                  onClick={checkRenderStatus}
                  disabled={isCheckingRender}
                  className="w-full py-2 px-4 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {isCheckingRender ? '확인 중...' : '🔄 렌더링 상태 확인하기'}
                </button>
              )}
            </div>
            
            {/* 실시간 로그 */}
            {renderLogs.length > 0 && (
              <div className="bg-gray-900 rounded-lg overflow-hidden">
                <div className="px-4 py-2 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-300">📋 작업 로그</span>
                  <span className="text-xs text-gray-500">자동 새로고침: 10초</span>
                </div>
                <div 
                  ref={logContainerRef}
                  className="p-4 max-h-60 overflow-y-auto font-mono text-sm space-y-1"
                >
                  {renderLogs.map((log, index) => (
                    <div 
                      key={index}
                      className={`flex gap-3 ${
                        log.type === 'success' ? 'text-green-400' :
                        log.type === 'error' ? 'text-red-400' :
                        log.type === 'warning' ? 'text-yellow-400' :
                        log.type === 'progress' ? 'text-blue-400' :
                        'text-gray-400'
                      }`}
                    >
                      <span className="text-gray-600 flex-shrink-0">[{log.time}]</span>
                      <span>{log.message}</span>
                    </div>
                  ))}
                  {(job.status === 'script' || job.status === 'audio' || job.status === 'render') && (
                    <div className="text-gray-500 flex items-center gap-2">
                      <span className="inline-block w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                      대기 중...
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* 멀티클립 정보 */}
            {job.status === 'render' && job.brewJobId?.startsWith('multiclip|') && (
              <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                <h3 className="font-semibold text-purple-800 mb-2">🎬 멀티클립 모드</h3>
                {(() => {
                  const parts = job.brewJobId.split('|');
                  const model = parts[1] || 'unknown';
                  const duration = parts[2] || '60';
                  const clipIds = parts[3]?.split(',').filter(Boolean) || [];
                  return (
                    <div className="text-sm text-purple-700 space-y-1">
                      <p>📌 모델: <span className="font-medium">{model}</span></p>
                      <p>⏱️ 목표 길이: <span className="font-medium">{duration}초</span></p>
                      <p>🎞️ 클립 수: <span className="font-medium">{clipIds.length}개</span></p>
                      <p className="text-purple-600 text-xs mt-2">
                        💡 각 클립이 순차적으로 생성된 후 자동으로 합쳐집니다.
                      </p>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </section>

      {/* 📺 YouTube 업로드 */}
      <section className="card mb-8">
        <h2 className="text-xl font-bold mb-4">📺 YouTube 업로드</h2>

        {job.youtubeUrl ? (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-start gap-3">
              <span className="text-2xl">✅</span>
              <div className="flex-1">
                <p className="font-semibold text-green-800 mb-2">YouTube에 업로드 완료!</p>
                <a
                  href={job.youtubeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                >
                  ▶️ YouTube에서 보기
                </a>
              </div>
            </div>
          </div>
        ) : job.videoUrl ? (
          <div>
            {uploadError && (
              <div className="p-4 mb-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                <p className="font-semibold">⚠️ 업로드 오류</p>
                <p className="text-sm mt-1">{uploadError}</p>
              </div>
            )}
            
            {uploadSuccess && (
              <div className="p-4 mb-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
                ✅ 업로드가 완료되었습니다!
              </div>
            )}

            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg mb-4">
              <p className="text-sm text-gray-600 mb-3">
                아래 버튼을 클릭하면 영상이 YouTube에 업로드됩니다.
              </p>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">제목:</span>
                  <p className="font-medium">{job.topic} #shorts</p>
                </div>
                <div>
                  <span className="text-gray-500">공개 설정:</span>
                  <p className="font-medium">공개 (Public)</p>
                </div>
              </div>
            </div>

            <button
              onClick={handleUpload}
              disabled={isUploading}
              className="w-full py-4 px-6 bg-red-600 hover:bg-red-700 text-white font-semibold text-lg rounded-lg
                       shadow-md hover:shadow-lg transition-all duration-200 
                       disabled:opacity-50 disabled:cursor-not-allowed
                       flex items-center justify-center gap-3"
            >
              {isUploading ? (
                <>
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  업로드 중...
                </>
              ) : (
                <>
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/>
                  </svg>
                  YouTube에 업로드하기
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-700">
            ⏳ 영상이 아직 생성되지 않았습니다. 렌더링이 완료될 때까지 기다려주세요.
          </div>
        )}
      </section>

      {/* 🎤 오디오 */}
      {job.audioUrl && (
        <section className="card mb-8">
          <h2 className="text-xl font-bold mb-4">🎤 음성</h2>
          <audio controls className="w-full" preload="metadata">
            <source src={job.audioUrl} type="audio/mpeg" />
            브라우저가 오디오 재생을 지원하지 않습니다.
          </audio>
        </section>
      )}

      {/* 📝 스크립트 */}
      {job.script && (
        <section className="card mb-8">
          <h2 className="text-xl font-bold mb-4">📝 스크립트</h2>
          <div className="p-4 bg-gray-50 rounded-lg whitespace-pre-wrap text-gray-700 leading-relaxed">
            {job.script}
          </div>
        </section>
      )}

      {/* ⚠️ 에러 */}
      {job.errorMessage && (
        <section className="card mb-8 border-red-200 bg-red-50">
          <h2 className="text-xl font-bold mb-4 text-red-700">⚠️ 오류 정보</h2>
          <p className="text-red-600">{job.errorMessage}</p>
        </section>
      )}

      {/* ℹ️ 작업 정보 */}
      <section className="card">
        <h2 className="text-xl font-bold mb-4">ℹ️ 작업 정보</h2>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-gray-500">작업 ID</dt>
            <dd className="font-mono text-xs break-all">{job.id}</dd>
          </div>
          <div>
            <dt className="text-gray-500">상태</dt>
            <dd>{job.status}</dd>
          </div>
          <div>
            <dt className="text-gray-500">생성일</dt>
            <dd>{new Date(job.createdAt).toLocaleString("ko-KR")}</dd>
          </div>
          <div>
            <dt className="text-gray-500">수정일</dt>
            <dd>{new Date(job.updatedAt).toLocaleString("ko-KR")}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
