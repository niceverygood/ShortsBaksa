/**
 * Google Gemini AI를 이용한 유튜브 스크립트 생성
 * 
 * 50-60대 시청자를 타겟으로 한 유튜브 쇼츠 스크립트를 생성합니다.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { GenerateScriptOptions } from '@/types';

// Google AI 클라이언트 (lazy initialization)
let genAI: GoogleGenerativeAI | null = null;

function getGoogleAIClient(): GoogleGenerativeAI {
  if (!genAI) {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_AI_API_KEY 환경변수가 설정되지 않았습니다.');
    }
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

/**
 * 카테고리별 추가 컨텍스트
 */
const CATEGORY_CONTEXT: Record<string, string> = {
  health: '건강, 의료, 질병 예방, 운동, 영양에 관한 실용적인 정보',
  finance: '재테크, 저축, 투자, 연금, 노후 대비에 관한 실용적인 금융 정보',
  healing: '마음 건강, 스트레스 해소, 명상, 긍정적 사고에 관한 위로와 조언',
  lifestyle: '일상 생활, 주거, 정리 정돈, 생활 꿀팁에 관한 실용적인 정보',
  hobby: '취미, 여가 활동, 배움, 자기계발에 관한 정보',
  travel: '여행, 관광지, 여행 팁, 국내외 명소에 관한 정보',
  food: '요리, 레시피, 건강 식단, 제철 음식에 관한 정보',
  culture: '역사, 문화, 전통, 교양에 관한 흥미로운 이야기',
  tech: '스마트폰, 앱 사용법, 디지털 기기 활용에 관한 쉬운 설명',
  etc: '50-60대가 관심을 가질 만한 다양한 주제',
};

/**
 * 유튜브 쇼츠 스크립트를 생성합니다.
 * 
 * @param options - 스크립트 생성 옵션
 * @returns 생성된 스크립트 텍스트
 */
export async function generateScript(options: GenerateScriptOptions): Promise<string> {
  const { topic, category = 'etc' } = options;
  
  const client = getGoogleAIClient();
  const categoryContext = CATEGORY_CONTEXT[category] || CATEGORY_CONTEXT.etc;

  const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = `당신은 50-60대 한국인 시청자를 위한 유튜브 쇼츠 콘텐츠 전문 작가입니다.

당신의 역할:
- 친절하고 따뜻한 전문가 톤으로 작성합니다.
- 어려운 용어는 피하고, 이해하기 쉬운 표현을 사용합니다.
- 존댓말을 사용하며, 시청자를 존중하는 어투를 유지합니다.
- 실생활에 바로 적용할 수 있는 실용적인 정보를 제공합니다.

스크립트 구조 (반드시 이 순서대로):
1. 훅 (Hook) - 시청자의 관심을 끄는 강력한 한 문장
2. 핵심 내용 3가지 - 주제에 대한 핵심 정보나 팁
3. 실천 팁 1가지 - 오늘 바로 실천할 수 있는 구체적인 행동
4. 마무리 한 문장 - 긍정적인 마무리 또는 응원 메시지

분량: 180-220 단어 (약 50-60초 분량)

주의사항:
- 과학적 근거가 있는 정보만 전달합니다.
- 과장하거나 불안을 조성하는 표현은 피합니다.
- 구어체로 자연스럽게 읽히도록 작성합니다.
- 번호나 기호 없이 자연스러운 문장으로 연결합니다.

다음 주제로 유튜브 쇼츠 스크립트를 작성해주세요.

주제: ${topic}
카테고리: ${categoryContext}

위 구조와 분량을 반드시 지켜서 스크립트만 작성해주세요. 추가 설명이나 메타 정보는 포함하지 마세요.`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const script = response.text();
    
    if (!script) {
      throw new Error('Google AI가 스크립트를 생성하지 못했습니다.');
    }

    return script.trim();
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Google AI API 오류: ${error.message}`);
    }
    throw error;
  }
}
