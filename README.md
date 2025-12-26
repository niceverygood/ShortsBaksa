# 🎬 쇼츠 박사 (Shorts Baksa)

50-60대를 위한 유튜브 쇼츠 자동 생성/업로드 웹 서비스입니다.

주제만 입력하면, AI가 스크립트 작성부터 영상 제작, YouTube 업로드까지 모든 과정을 자동으로 처리합니다.

## ✨ 주요 기능

1. **스크립트 자동 생성**: OpenAI를 활용하여 50-60대 맞춤 유튜브 쇼츠 스크립트 생성
2. **음성 생성(TTS)**: ElevenLabs를 통한 자연스러운 한국어 나레이션 생성
3. **영상 렌더링**: Brew AI를 활용한 9:16 쇼츠 영상 자동 생성
4. **자동 업로드**: YouTube Data API를 통한 영상 자동 업로드

## 🛠 기술 스택

- **Frontend**: Next.js 16, React 19, TailwindCSS 4
- **Backend**: Next.js API Routes (App Router)
- **언어**: TypeScript
- **외부 API**:
  - OpenAI (GPT-4o)
  - ElevenLabs TTS
  - Brew AI
  - YouTube Data API v3

## 📁 프로젝트 구조

```
shorts_baksa/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/
│   │   │   ├── pipeline/       # 영상 생성 파이프라인 API
│   │   │   │   ├── route.ts
│   │   │   │   └── check-and-upload/
│   │   │   │       └── route.ts
│   │   │   └── jobs/           # Job 조회 API
│   │   │       ├── route.ts
│   │   │       └── [id]/
│   │   │           └── route.ts
│   │   ├── jobs/
│   │   │   └── page.tsx        # 작업 목록 페이지
│   │   ├── layout.tsx
│   │   ├── page.tsx            # 메인 페이지
│   │   └── globals.css
│   ├── lib/                    # 유틸리티 라이브러리
│   │   ├── llm.ts              # OpenAI 스크립트 생성
│   │   ├── elevenlabs.ts       # ElevenLabs TTS
│   │   ├── storage.ts          # 파일 저장소
│   │   ├── brew.ts             # Brew AI 영상 생성
│   │   ├── youtube.ts          # YouTube 업로드
│   │   └── jobs.ts             # Job 상태 관리
│   └── types/
│       └── index.ts            # TypeScript 타입 정의
├── data/                       # Job 데이터 저장 (JSON)
├── public/
│   ├── audio/                  # 생성된 오디오 파일
│   └── videos/                 # 생성된 비디오 파일
├── tmp/                        # 임시 파일
└── package.json
```

## 🚀 시작하기

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경변수 설정

`.env.local` 파일을 생성하고 다음 환경변수를 설정하세요:

```env
# OpenAI API (스크립트 생성용)
OPENAI_API_KEY=your_openai_api_key

# ElevenLabs TTS API (음성 생성용)
ELEVENLABS_API_KEY=your_elevenlabs_api_key
ELEVENLABS_VOICE_ID=your_default_voice_id

# Brew AI (영상 생성용)
BREW_API_KEY=your_brew_api_key
BREW_PROJECT_ID=your_brew_project_id
BREW_TEMPLATE_ID=your_brew_template_id

# YouTube Data API (영상 업로드용)
YOUTUBE_CLIENT_ID=your_youtube_client_id
YOUTUBE_CLIENT_SECRET=your_youtube_client_secret
YOUTUBE_REFRESH_TOKEN=your_youtube_refresh_token
YOUTUBE_CHANNEL_ID=your_youtube_channel_id

# 서버 설정 (선택사항)
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

### 3. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 http://localhost:3000 으로 접속하세요.

## 📡 API 엔드포인트

### POST /api/pipeline

영상 생성 파이프라인을 시작합니다.

**요청 본문:**
```json
{
  "topic": "50대 무릎 관절 건강",
  "category": "health",
  "voiceId": "선택적_음성_ID",
  "autoUpload": true
}
```

**응답:**
```json
{
  "success": true,
  "job": {
    "id": "uuid",
    "topic": "50대 무릎 관절 건강",
    "status": "render",
    "script": "생성된 스크립트...",
    "audioUrl": "/audio/tts-123.mp3",
    ...
  },
  "message": "영상 생성 파이프라인이 시작되었습니다."
}
```

### POST /api/pipeline/check-and-upload

Brew 렌더링 상태를 확인하고, 완료 시 YouTube에 업로드합니다.

**요청 본문:**
```json
{
  "jobId": "job-uuid"
}
```

### GET /api/jobs

Job 목록을 조회합니다.

**쿼리 파라미터:**
- `limit`: 조회할 최대 개수 (기본값: 20)
- `offset`: 시작 위치 (기본값: 0)

### GET /api/jobs/[id]

특정 Job의 상세 정보를 조회합니다.

## 🎯 영상 생성 파이프라인

1. **스크립트 생성** (OpenAI)
   - 주제와 카테고리를 기반으로 50-60대 맞춤 스크립트 생성
   - 약 180-220 단어, 50-60초 분량

2. **음성 생성** (ElevenLabs)
   - 생성된 스크립트를 자연스러운 한국어 음성으로 변환
   - 다국어 지원 모델(eleven_multilingual_v2) 사용

3. **영상 렌더링** (Brew AI)
   - 스크립트와 오디오를 기반으로 9:16 세로 영상 생성
   - 비동기 작업으로 진행

4. **YouTube 업로드**
   - 렌더링 완료 후 자동으로 YouTube에 업로드
   - 기본 공개 상태: unlisted (미등록)

## 🏷 카테고리

- `health`: 건강/의료
- `finance`: 재테크/금융
- `healing`: 힐링/마음건강
- `lifestyle`: 라이프스타일
- `hobby`: 취미/여가
- `travel`: 여행
- `food`: 요리/음식
- `culture`: 문화/역사
- `tech`: 디지털/IT
- `etc`: 기타

## ⚠️ 주의사항

- 모든 API 키는 환경변수로 관리하며, 코드에 하드코딩하지 않습니다.
- Brew AI의 실제 API 스펙에 맞게 `src/lib/brew.ts` 파일을 수정해야 할 수 있습니다.
- YouTube 업로드를 위해서는 OAuth2 인증이 필요합니다.

## 📝 YouTube OAuth2 설정 방법

1. [Google Cloud Console](https://console.cloud.google.com/)에서 프로젝트 생성
2. YouTube Data API v3 활성화
3. OAuth 2.0 클라이언트 ID 생성 (웹 애플리케이션)
4. [OAuth Playground](https://developers.google.com/oauthplayground)에서 Refresh Token 획득
   - 스코프: `https://www.googleapis.com/auth/youtube.upload`

## 📄 라이선스

MIT License
