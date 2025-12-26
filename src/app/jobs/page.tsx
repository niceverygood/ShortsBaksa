"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Job, JobsListResponse, CheckAndUploadResponse } from "@/types";

export default function JobsPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // 상세 보기 상태
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  
  // 렌더링 상태 확인 중인 Job
  const [checkingJobId, setCheckingJobId] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      const response = await fetch("/api/jobs?limit=50");
      const data: JobsListResponse = await response.json();
      if (data.success) {
        setJobs(data.jobs);
        setTotal(data.total);
      } else {
        setError("작업 목록을 불러오는데 실패했습니다.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "네트워크 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    
    // 30초마다 자동 새로고침
    const interval = setInterval(fetchJobs, 30000);
    return () => clearInterval(interval);
  }, [fetchJobs]);

  const handleCheckAndUpload = async (jobId: string) => {
    setCheckingJobId(jobId);
    
    try {
      const response = await fetch("/api/pipeline/check-and-upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ jobId }),
      });

      const data: CheckAndUploadResponse = await response.json();
      
      if (data.success) {
        // 목록 갱신
        await fetchJobs();
        
        // 선택된 Job이 업데이트된 Job이면 상세 정보도 갱신
        if (selectedJob?.id === jobId) {
          setSelectedJob(data.job);
        }
        
        alert(data.message);
      } else {
        alert(`오류: ${data.message}`);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "상태 확인 중 오류가 발생했습니다.");
    } finally {
      setCheckingJobId(null);
    }
  };

  const getStatusBadge = (status: Job["status"]) => {
    const statusConfig = {
      script: { label: "스크립트 생성", class: "badge-script", icon: "✍️" },
      audio: { label: "음성 생성", class: "badge-audio", icon: "🎤" },
      prompts: { label: "프롬프트 생성", class: "badge-prompts", icon: "🎨" },
      render: { label: "영상 렌더링", class: "badge-render", icon: "🎬" },
      merge: { label: "영상 합치기", class: "badge-merge", icon: "🔗" },
      upload: { label: "업로드 중", class: "badge-upload", icon: "📤" },
      completed: { label: "완료", class: "badge-completed", icon: "✅" },
      failed: { label: "실패", class: "badge-failed", icon: "❌" },
    };
    
    const config = statusConfig[status];
    return (
      <span className={`badge ${config.class}`}>
        {config.icon} {config.label}
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getCategoryLabel = (category: string | null) => {
    const categories: Record<string, string> = {
      health: "건강/의료",
      finance: "재테크/금융",
      healing: "힐링/마음건강",
      lifestyle: "라이프스타일",
      hobby: "취미/여가",
      travel: "여행",
      food: "요리/음식",
      culture: "문화/역사",
      tech: "디지털/IT",
      etc: "기타",
    };
    return category ? categories[category] || category : "-";
  };

  if (isLoading) {
    return (
      <div className="container">
        <div className="max-w-4xl mx-auto text-center py-20">
          <span className="inline-block w-8 h-8 border-3 border-[var(--color-border)] border-t-[var(--color-primary)] rounded-full animate-spin mb-4" />
          <p className="text-[var(--color-text-muted)]">작업 목록을 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container">
        <div className="max-w-4xl mx-auto">
          <div className="card bg-red-50 border-red-200 text-center py-10">
            <p className="text-4xl mb-4">⚠️</p>
            <p className="text-red-700 font-medium">{error}</p>
            <button
              onClick={() => {
                setError(null);
                setIsLoading(true);
                fetchJobs();
              }}
              className="mt-4 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-[var(--radius-md)] transition-colors"
            >
              다시 시도
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="max-w-5xl mx-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-text)]">
              📋 작업 목록
            </h1>
            <p className="text-[var(--color-text-muted)] mt-1">
              총 {total}개의 작업
            </p>
          </div>
          <button
            onClick={() => {
              setIsLoading(true);
              fetchJobs();
            }}
            className="px-4 py-2 bg-[var(--color-bg-secondary)] hover:bg-[var(--color-border)]
                     text-[var(--color-text-secondary)] rounded-[var(--radius-md)] transition-colors
                     flex items-center gap-2"
          >
            🔄 새로고침
          </button>
        </div>

        {jobs.length === 0 ? (
          <div className="card text-center py-16">
            <p className="text-5xl mb-4">📭</p>
            <p className="text-xl font-medium text-[var(--color-text)]">
              아직 생성된 작업이 없습니다
            </p>
            <p className="text-[var(--color-text-muted)] mt-2">
              메인 페이지에서 영상 생성을 시작해보세요!
            </p>
            <a
              href="/"
              className="inline-block mt-6 px-6 py-3 bg-[var(--color-primary)] hover:bg-[var(--color-primary-light)]
                       text-white rounded-[var(--radius-md)] font-medium transition-colors"
            >
              영상 만들기 →
            </a>
          </div>
        ) : (
          <div className="grid gap-4">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="card hover:shadow-[var(--shadow-lg)] transition-all cursor-pointer"
                onClick={() => router.push(`/jobs/${job.id}`)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      {getStatusBadge(job.status)}
                      <span className="text-sm text-[var(--color-text-muted)]">
                        {getCategoryLabel(job.category)}
                      </span>
                    </div>
                    <h3 className="text-lg font-medium text-[var(--color-text)] mb-1">
                      {job.topic}
                    </h3>
                    <p className="text-sm text-[var(--color-text-muted)]">
                      {formatDate(job.createdAt)}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {/* 렌더링 상태일 때만 상태 확인 버튼 표시 */}
                    {job.status === "render" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCheckAndUpload(job.id);
                        }}
                        disabled={checkingJobId === job.id}
                        className="px-3 py-1.5 bg-[var(--color-accent)] hover:bg-[var(--color-accent-dark)]
                                 text-white text-sm rounded-[var(--radius-sm)] transition-colors
                                 disabled:opacity-50 flex items-center gap-1"
                      >
                        {checkingJobId === job.id ? (
                          <>
                            <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                            확인 중
                          </>
                        ) : (
                          "렌더링 확인"
                        )}
                      </button>
                    )}
                    
                    {/* YouTube 링크 */}
                    {job.youtubeUrl && (
                      <a
                        href={job.youtubeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="px-3 py-1.5 bg-red-500 hover:bg-red-600
                                 text-white text-sm rounded-[var(--radius-sm)] transition-colors
                                 flex items-center gap-1"
                      >
                        ▶️ YouTube
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 상세 정보 모달 */}
        {selectedJob && (
          <div 
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedJob(null)}
          >
            <div 
              className="bg-[var(--color-bg-card)] rounded-[var(--radius-lg)] shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 모달 헤더 */}
              <div className="sticky top-0 bg-[var(--color-bg-card)] border-b border-[var(--color-border)] p-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-[var(--color-text)]">
                  작업 상세 정보
                </h2>
                <button
                  onClick={() => setSelectedJob(null)}
                  className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-2xl"
                >
                  ×
                </button>
              </div>

              {/* 모달 본문 */}
              <div className="p-4 space-y-4">
                {/* 기본 정보 */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-[var(--color-text-muted)]">상태</label>
                    <div className="mt-1">{getStatusBadge(selectedJob.status)}</div>
                  </div>
                  <div>
                    <label className="text-sm text-[var(--color-text-muted)]">카테고리</label>
                    <p className="mt-1 font-medium">{getCategoryLabel(selectedJob.category)}</p>
                  </div>
                  <div>
                    <label className="text-sm text-[var(--color-text-muted)]">생성 시간</label>
                    <p className="mt-1">{formatDate(selectedJob.createdAt)}</p>
                  </div>
                  <div>
                    <label className="text-sm text-[var(--color-text-muted)]">자동 업로드</label>
                    <p className="mt-1">{selectedJob.autoUpload ? "예" : "아니오"}</p>
                  </div>
                </div>

                {/* 주제 */}
                <div>
                  <label className="text-sm text-[var(--color-text-muted)]">주제</label>
                  <p className="mt-1 text-lg font-medium">{selectedJob.topic}</p>
                </div>

                {/* 스크립트 */}
                {selectedJob.script && (
                  <div>
                    <label className="text-sm text-[var(--color-text-muted)]">생성된 스크립트</label>
                    <div className="mt-1 p-3 bg-[var(--color-bg-secondary)] rounded-[var(--radius-md)] text-sm whitespace-pre-wrap leading-relaxed">
                      {selectedJob.script}
                    </div>
                  </div>
                )}

                {/* 오디오 URL */}
                {selectedJob.audioUrl && (
                  <div>
                    <label className="text-sm text-[var(--color-text-muted)]">오디오 파일</label>
                    <div className="mt-1">
                      <audio controls className="w-full">
                        <source src={selectedJob.audioUrl} type="audio/mpeg" />
                      </audio>
                    </div>
                  </div>
                )}

                {/* 비디오 URL */}
                {selectedJob.videoUrl && (
                  <div>
                    <label className="text-sm text-[var(--color-text-muted)]">영상 파일</label>
                    <div className="mt-1">
                      <video controls className="w-full rounded-[var(--radius-md)]">
                        <source src={selectedJob.videoUrl} type="video/mp4" />
                      </video>
                    </div>
                  </div>
                )}

                {/* YouTube URL */}
                {selectedJob.youtubeUrl && (
                  <div>
                    <label className="text-sm text-[var(--color-text-muted)]">YouTube 링크</label>
                    <a
                      href={selectedJob.youtubeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 block px-4 py-3 bg-red-500 hover:bg-red-600 text-white rounded-[var(--radius-md)] text-center transition-colors"
                    >
                      ▶️ YouTube에서 보기
                    </a>
                  </div>
                )}

                {/* 에러 메시지 */}
                {selectedJob.errorMessage && (
                  <div>
                    <label className="text-sm text-[var(--color-text-muted)]">오류 메시지</label>
                    <div className="mt-1 p-3 bg-red-50 border border-red-200 rounded-[var(--radius-md)] text-red-700">
                      {selectedJob.errorMessage}
                    </div>
                  </div>
                )}

                {/* 렌더링 상태 확인 버튼 */}
                {selectedJob.status === "render" && (
                  <button
                    onClick={() => handleCheckAndUpload(selectedJob.id)}
                    disabled={checkingJobId === selectedJob.id}
                    className="w-full py-3 bg-[var(--color-primary)] hover:bg-[var(--color-primary-light)]
                             text-white font-medium rounded-[var(--radius-md)] transition-colors
                             disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {checkingJobId === selectedJob.id ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        상태 확인 중...
                      </>
                    ) : (
                      "🔄 렌더링 상태 확인 및 업로드"
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}




