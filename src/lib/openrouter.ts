/**
 * OpenRouter API 클라이언트 - 최신 AI 모델 활용
 * 
 * 하나의 API 키로 최신 AI 모델들을 상황에 맞게 활용합니다.
 * - 스크립트 생성: Claude Opus 4.5 (최고 품질, 창의성)
 * - 이미지 프롬프트: GPT 5.2 (최신 GPT)
 * - SEO 최적화: Gemini 3 Flash (속도)
 * - 빠른 작업: GPT 5 Nano (저비용, 빠른 속도)
 */

import OpenAI from 'openai';

// OpenRouter 클라이언트 (OpenAI SDK 호환)
let openRouterClient: OpenAI | null = null;

function getOpenRouterClient(): OpenAI {
  if (!openRouterClient) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY 환경변수가 설정되지 않았습니다.');
    }
    
    openRouterClient = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: apiKey,
      defaultHeaders: {
        'HTTP-Referer': process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3002',
        'X-Title': 'Shorts Baksa - YouTube Shorts Auto Generator',
      },
    });
  }
  return openRouterClient;
}

// 🚀 최신 모델 매핑 (2025년 최신)
export const AI_MODELS = {
  // 스크립트 생성 - Claude Opus 4 (최고 품질, 창의성)
  script: 'anthropic/claude-opus-4',
  
  // 이미지/비디오 프롬프트 생성 - GPT 5.2 (최신 GPT)
  imagePrompt: 'openai/gpt-5.2-chat',
  
  // SEO 최적화 (제목, 태그, 설명) - Gemini 3 Flash (속도)
  seo: 'google/gemini-3-flash-preview',
  
  // 스크립트 검토/개선 - Gemini 3 Pro (균형)
  review: 'google/gemini-3-pro-preview',
  
  // 빠른 작업용 - GPT 5 Mini (저비용, 초고속)
  fast: 'openai/gpt-5-mini',
} as const;

export type AITask = keyof typeof AI_MODELS;

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface GenerateOptions {
  task: AITask;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  customModel?: string; // 커스텀 모델 지정 가능
}

/**
 * OpenRouter를 통해 AI 응답을 생성합니다.
 */
export async function generate(options: GenerateOptions): Promise<string> {
  const client = getOpenRouterClient();
  const model = options.customModel || AI_MODELS[options.task];
  
  console.log(`[OpenRouter] 모델: ${model}, 작업: ${options.task}`);
  
  try {
    const response = await client.chat.completions.create({
      model: model,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2048,
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('AI 응답이 비어있습니다.');
    }
    
    console.log(`[OpenRouter] 응답 완료 (${content.length}자)`);
    return content;
  } catch (error) {
    if (error instanceof Error) {
      console.error(`[OpenRouter] 오류:`, error.message);
      throw new Error(`OpenRouter API 오류: ${error.message}`);
    }
    throw error;
  }
}

/**
 * 50-60대 시청자를 위한 YouTube Shorts 스크립트를 생성합니다.
 */
// AI 모델 ID 매핑 (2025년 최신 모델)
const SCRIPT_AI_MODEL_MAP: Record<string, string> = {
  'claude': 'anthropic/claude-opus-4',      // Claude Opus 4 (최신)
  'gpt-5': 'openai/gpt-5.2-chat',           // GPT 5.2 (최신)
  'gemini': 'google/gemini-3-pro-preview',  // Gemini 3 Pro (최신)
};

export async function generateScript(options: {
  topic: string;
  category?: string;
  tone?: string;
  aiModel?: string; // claude, gpt-4, gemini
}): Promise<string> {
  const { topic, category = '건강', tone = '따뜻하고 친근한', aiModel = 'claude' } = options;
  
  // 선택된 AI 모델 결정
  const customModel = SCRIPT_AI_MODEL_MAP[aiModel] || SCRIPT_AI_MODEL_MAP['claude'];
  console.log(`[generateScript] 선택된 AI: ${aiModel} → ${customModel}`);
  
  const systemPrompt = `당신은 50-60대 한국인 시청자를 위한 YouTube Shorts 스크립트 전문 작가입니다.

작성 원칙:
1. 따뜻하고 친근한 말투로 작성 (존댓말 사용)
2. 어려운 전문용어는 쉽게 풀어서 설명
3. 실생활에 바로 적용할 수 있는 실용적인 정보 제공
4. 60-90초 분량 (약 300-450자)
5. 도입(관심 유도) → 본론(핵심 정보 3가지) → 마무리(실천 유도) 구조
6. 숫자나 통계는 기억하기 쉽게 표현

카테고리: ${category}
톤앤매너: ${tone}`;

  const userPrompt = `주제: "${topic}"

위 주제로 50-60대 시청자를 위한 YouTube Shorts 스크립트를 작성해주세요.
- 실제로 도움이 되는 정보를 담아주세요
- 시청자가 "이건 꼭 해봐야겠다"라고 느낄 수 있게 작성해주세요
- 스크립트만 출력하고, 다른 설명은 포함하지 마세요`;

  return generate({
    task: 'script',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.8,
    maxTokens: 1024,
    customModel, // 선택된 AI 모델 사용
  });
}

/**
 * 스크립트를 기반으로 이미지 생성 프롬프트를 만듭니다.
 */
export async function generateImagePrompts(options: {
  script: string;
  sceneCount?: number;
}): Promise<string[]> {
  const { script, sceneCount = 5 } = options;
  
  const systemPrompt = `당신은 YouTube Shorts 영상에 사용할 이미지 프롬프트를 생성하는 전문가입니다.

요구사항:
- 50-60대 한국인 시청자에게 친근하고 따뜻한 느낌의 이미지
- 고품질 사진 스타일 (Professional photograph)
- 각 장면은 스크립트의 핵심 메시지를 시각적으로 표현
- 영어로 작성
- 한 줄에 하나의 프롬프트`;

  const userPrompt = `다음 스크립트를 ${sceneCount}개 장면으로 나누고, 각 장면에 맞는 이미지 생성 프롬프트를 작성해주세요.

스크립트:
${script}

각 프롬프트는 다음 형식으로 작성:
"Professional photograph, warm lighting, [장면 설명], Korean senior lifestyle, high quality, 9:16 aspect ratio"

${sceneCount}개의 프롬프트만 출력하세요 (번호 없이 한 줄에 하나씩):`;

  const response = await generate({
    task: 'imagePrompt',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.7,
    maxTokens: 1024,
  });
  
  // 응답에서 프롬프트 추출
  const prompts = response
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 20 && line.toLowerCase().includes('professional'));
  
  // 부족하면 기본 프롬프트로 채움
  while (prompts.length < sceneCount) {
    prompts.push('Professional photograph, warm lighting, peaceful Korean senior lifestyle, healthy living, high quality, 9:16 aspect ratio');
  }
  
  return prompts.slice(0, sceneCount);
}

/**
 * YouTube SEO 최적화 (제목, 설명, 태그)
 */
export async function generateSEO(options: {
  script: string;
  topic: string;
  category?: string;
}): Promise<{
  title: string;
  description: string;
  tags: string[];
}> {
  const { script, topic, category = '건강' } = options;
  
  const systemPrompt = `당신은 YouTube Shorts SEO 전문가입니다. 50-60대 시청자를 타겟으로 합니다.`;

  const userPrompt = `다음 스크립트에 대한 YouTube SEO 정보를 생성해주세요.

주제: ${topic}
카테고리: ${category}
스크립트:
${script.substring(0, 500)}...

다음 JSON 형식으로만 응답하세요:
{
  "title": "제목 (30자 이내, 이모지 포함, 50대 시청자 관심 유도)",
  "description": "설명 (100자 이내, 핵심 내용 요약, 해시태그 포함)",
  "tags": ["태그1", "태그2", "태그3", "태그4", "태그5"]
}`;

  const response = await generate({
    task: 'seo',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.6,
    maxTokens: 512,
  });
  
  try {
    // JSON 추출
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.warn('[OpenRouter] SEO JSON 파싱 실패, 기본값 사용');
  }
  
  // 파싱 실패 시 기본값
  return {
    title: `${topic} - 꼭 알아야 할 정보 📌`,
    description: `${topic}에 대한 유용한 정보를 알려드립니다. #건강 #50대 #생활정보`,
    tags: [topic, category, '50대', '건강정보', '생활팁'],
  };
}

/**
 * 스크립트 품질 검토 및 개선 제안
 */
export async function reviewScript(script: string): Promise<{
  score: number;
  suggestions: string[];
  improvedScript?: string;
}> {
  const systemPrompt = `당신은 YouTube Shorts 스크립트 편집자입니다. 50-60대 시청자 관점에서 스크립트를 평가합니다.`;

  const userPrompt = `다음 스크립트를 평가하고 개선점을 제안해주세요:

${script}

다음 JSON 형식으로 응답:
{
  "score": 1-10 점수,
  "suggestions": ["개선점1", "개선점2"],
  "improvedScript": "개선된 스크립트 (선택사항)"
}`;

  const response = await generate({
    task: 'review',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.5,
    maxTokens: 1536,
  });
  
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.warn('[OpenRouter] Review JSON 파싱 실패');
  }
  
  return { score: 7, suggestions: ['스크립트가 양호합니다.'] };
}

/**
 * OpenRouter API 연결 테스트
 */
export async function testConnection(): Promise<boolean> {
  try {
    const response = await generate({
      task: 'fast',
      messages: [
        { role: 'user', content: '안녕' },
      ],
      maxTokens: 30,
    });
    
    console.log('[OpenRouter] 테스트 응답:', response);
    return response.length > 0;
  } catch (error) {
    console.error('[OpenRouter] 연결 테스트 실패:', error);
    return false;
  }
}

/**
 * 영상 프롬프트 생성 옵션
 */
interface VideoPromptOptions {
  topic: string;
  category?: string;
  scriptSections: string[];
  clipCount: number;
  sceneIndex: number;
  totalScenes: number;
  previousPrompt?: string; // 이전 장면 프롬프트 (일관성 유지용)
}

/**
 * 스크립트 섹션 기반 영상 프롬프트 생성
 * 
 * 각 스크립트 섹션에 맞는 영상 프롬프트를 AI가 생성합니다.
 * **대사 내용의 핵심 키워드와 주제를 직접 반영**하여 관련성 높은 영상을 생성합니다.
 */
export async function generateVideoPrompts(options: VideoPromptOptions): Promise<string[]> {
  const { topic, category, scriptSections, sceneIndex, totalScenes, previousPrompt } = options;
  
  const categoryVisuals = getCategoryVisuals(category);
  const scriptContent = scriptSections[0];
  
  const systemPrompt = `당신은 YouTube Shorts 영상 프롬프트 전문가입니다.

핵심 원칙: **대사 내용과 직접 연관된 시각적 장면**을 묘사해야 합니다.

⚠️ 중요: 대사에서 언급하는 구체적인 키워드, 개념, 행동을 영상으로 보여줘야 합니다.
- "재테크" → 투자 관련 시각적 요소 (차트, 주식 앱, 부동산, 통장 등)
- "건강" → 건강 관련 시각적 요소 (운동, 음식, 병원, 건강검진 등)
- "김치" → 김치 관련 시각적 요소 (김치, 요리, 재료 등)
- "유산균" → 유산균 관련 시각적 요소 (요거트, 건강기능식품, 장 건강 등)

프롬프트 작성 규칙:
1. **대사의 핵심 키워드**를 시각적으로 표현할 것
2. 50-60대 한국인 시청자에게 친숙하고 신뢰감 있는 이미지
3. 세로 9:16 포맷, 시네마틱 품질
4. 부드러운 카메라 움직임과 따뜻한 조명

카테고리별 시각적 요소:
${categoryVisuals}`;

  const userPrompt = `전체 주제: "${topic}"
카테고리: ${category || '일반'}
현재 장면: ${sceneIndex + 1}/${totalScenes}

${previousPrompt ? `[이전 장면 프롬프트 - 스타일 참고]:
"${previousPrompt.substring(0, 200)}..."
` : ''}

**이 장면의 대사 (영상으로 표현해야 할 내용):**
"""
${scriptContent}
"""

위 대사를 **시각적으로 직접 표현**하는 영상 프롬프트를 영어로 작성하세요.

예시:
- 대사 "재테크 성공하려면..." → 주식 차트, 스마트폰 투자 앱, 부동산 모형 등
- 대사 "김치가 건강에 좋다..." → 접시에 담긴 김치, 발효 항아리, 건강한 식탁 등
- 대사 "매일 걷기가 중요합니다..." → 공원을 걷는 시니어, 아침 산책로 등

요구사항:
1. 대사의 **핵심 키워드를 영상에서 직접 보여줄 것**
2. 50-60대 한국인에게 친숙한 환경과 상황
3. 따뜻한 자연광, 부드러운 카메라 움직임
4. 약 80-120 단어의 상세한 프롬프트

프롬프트만 출력 (설명 없이):`;

  try {
    const response = await generate({
      task: 'imagePrompt',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.8,
      maxTokens: 500,
    });
    
    // 응답에서 프롬프트 추출
    const prompt = response.trim();
    
    return [prompt];
  } catch (error) {
    console.error('[OpenRouter] 영상 프롬프트 생성 실패:', error);
    
    // 실패 시 기본 프롬프트 반환
    const fallbackPrompt = `Professional Korean lifestyle video. Scene ${sceneIndex + 1} of ${totalScenes}. 
Warm, inviting atmosphere with soft natural lighting. 
Clean, modern aesthetic. Calm and trustworthy mood.
9:16 vertical format for YouTube Shorts.
Content: ${scriptSections[0].substring(0, 100)}`;
    
    return [fallbackPrompt];
  }
}

/**
 * 카테고리별 컨텍스트
 */
function getCategoryContext(category?: string): string {
  const contexts: Record<string, string> = {
    health: '건강/의료 - 신뢰감 있는 의료 정보, 건강한 라이프스타일',
    finance: '재테크/금융 - 안정적이고 전문적인 금융 정보',
    healing: '힐링/마음건강 - 차분하고 평화로운 분위기',
    lifestyle: '라이프스타일 - 일상의 소소한 행복',
    hobby: '취미/여가 - 즐겁고 활기찬 분위기',
    travel: '여행 - 아름다운 풍경과 여유로운 분위기',
    food: '요리/음식 - 맛있고 건강한 음식, 따뜻한 식탁',
    culture: '문화/역사 - 교양 있고 품격 있는 분위기',
    tech: '디지털/IT - 현대적이고 깔끔한 분위기',
  };
  
  return contexts[category || ''] || '일반 정보성 콘텐츠';
}

/**
 * 카테고리별 시각적 요소 가이드
 */
function getCategoryVisuals(category?: string): string {
  const visuals: Record<string, string> = {
    '건강': `건강 카테고리 시각적 요소:
- 음식: 건강식, 과일, 채소, 발효식품, 건강기능식품
- 활동: 스트레칭, 가벼운 운동, 산책, 요가
- 장소: 병원, 약국, 건강검진센터, 공원
- 소품: 혈압계, 체중계, 비타민, 건강 앱
- 인물: 건강한 중년/시니어, 의료진`,
    
    '재테크': `재테크 카테고리 시각적 요소:
- 금융: 주식 차트, 투자 앱, 은행, 통장, 카드
- 부동산: 아파트, 부동산 계약서, 모형 집
- 소품: 계산기, 노트북, 스마트폰 금융앱, 돈
- 장소: 증권사, 은행 창구, 사무실
- 활동: 차트 분석, 계산, 상담`,
    
    '운동': `운동 카테고리 시각적 요소:
- 활동: 걷기, 스트레칭, 요가, 수영, 골프
- 장소: 공원, 산책로, 헬스장, 수영장, 골프장
- 소품: 운동화, 요가매트, 아령, 만보기
- 인물: 운동하는 시니어, 코치`,
    
    '요리': `요리 카테고리 시각적 요소:
- 음식: 완성된 요리, 재료, 반찬, 국물 요리
- 장소: 주방, 식탁, 마트
- 활동: 요리하는 손, 썰기, 볶기, 끓이기
- 소품: 냄비, 프라이팬, 칼, 도마, 그릇`,
    
    '생활팁': `생활팁 카테고리 시각적 요소:
- 장소: 집 안 곳곳, 거실, 침실, 욕실, 베란다
- 활동: 청소, 정리, DIY, 절약
- 소품: 청소도구, 수납용품, 생활용품
- 상황: 문제 해결 전후 비교, 꿀팁 시연`,
    
    '교양': `교양 카테고리 시각적 요소:
- 장소: 도서관, 박물관, 역사 유적지
- 소품: 책, 예술품, 역사 자료
- 활동: 독서, 감상, 관람
- 분위기: 품격있고 지적인 느낌`,
    
    '취미': `취미 카테고리 시각적 요소:
- 활동: 사진촬영, 그림그리기, 악기연주, 정원가꾸기
- 장소: 취미활동 공간, 동호회 모임
- 소품: 각 취미 관련 도구들
- 분위기: 즐겁고 여유로운 느낌`,
  };
  
  return visuals[category || ''] || `일반 시각적 요소:
- 대사에 언급된 핵심 키워드를 직접 시각화
- 50-60대 한국인에게 친숙한 환경
- 따뜻하고 신뢰감 있는 분위기`;
}

