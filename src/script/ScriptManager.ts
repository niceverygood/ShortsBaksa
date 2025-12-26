/**
 * ScriptManager - 스크립트 생성 및 문장 분리
 * 
 * 역할:
 * 1. 주제 기반 스크립트 생성 (GPT/Claude/Gemini)
 * 2. 문장 단위 자동 분리
 * 3. 각 문장의 예상 길이 계산
 */

import { generate, AI_MODELS } from '@/lib/openrouter';
import type { ScriptResult, Scene, CHARS_PER_SECOND_KO } from '@/core/types';

// AI 모델 매핑
const SCRIPT_AI_MAP: Record<string, string> = {
  'claude': 'anthropic/claude-opus-4',
  'gpt-5': 'openai/gpt-5.2-chat',
  'gemini': 'google/gemini-3-pro-preview',
};

// 한국어 TTS 기준 초당 글자 수
const CHARS_PER_SEC = 4.5;

export class ScriptManager {
  private aiModel: string;
  
  constructor(aiModel: 'claude' | 'gpt-5' | 'gemini' = 'claude') {
    this.aiModel = SCRIPT_AI_MAP[aiModel] || SCRIPT_AI_MAP['claude'];
  }

  /**
   * 스크립트 생성 + 문장 분리
   */
  async generateScript(options: {
    topic: string;
    category?: string;
    targetDurationSec: number;
  }): Promise<ScriptResult> {
    const { topic, category = '건강', targetDurationSec } = options;
    
    console.log(`[ScriptManager] 스크립트 생성 시작: "${topic}" (${targetDurationSec}초)`);
    
    // 목표 길이에 맞는 글자 수 계산
    const targetChars = Math.round(targetDurationSec * CHARS_PER_SEC);
    const minChars = Math.round(targetChars * 0.9);
    const maxChars = Math.round(targetChars * 1.1);
    
    const systemPrompt = `당신은 50-60대 한국인 시청자를 위한 YouTube Shorts 스크립트 전문 작가입니다.

작성 규칙:
1. 따뜻하고 친근한 말투 (존댓말)
2. 어려운 전문용어는 쉽게 풀어서 설명
3. 실생활에 바로 적용 가능한 정보
4. ${minChars}~${maxChars}자 분량 (정확히 ${targetDurationSec}초 TTS 기준)
5. 구조: 도입(후킹) → 본론(핵심 3가지) → 마무리(실천 유도)
6. 각 문장은 5~8초 안에 읽을 수 있는 길이로 작성
7. 문장은 반드시 마침표(.)로 끝내기

카테고리: ${category}`;

    const userPrompt = `주제: "${topic}"

위 주제로 ${targetDurationSec}초 분량의 YouTube Shorts 스크립트를 작성해주세요.
- 스크립트만 출력 (다른 설명 없이)
- 각 문장은 마침표로 구분
- 총 ${minChars}~${maxChars}자`;

    try {
      const fullScript = await generate({
        task: 'script',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.8,
        maxTokens: 1500,
        customModel: this.aiModel,
      });

      // 문장 분리
      const sentences = this.splitIntoSentences(fullScript.trim());
      
      // 예상 전체 길이 계산
      const estimatedDurationMs = this.calculateDurationMs(fullScript);
      
      console.log(`[ScriptManager] 스크립트 생성 완료: ${sentences.length}개 문장, 예상 ${Math.round(estimatedDurationMs / 1000)}초`);
      
      return {
        fullScript: fullScript.trim(),
        sentences,
        estimatedDurationMs,
      };
    } catch (error) {
      console.error('[ScriptManager] 스크립트 생성 실패:', error);
      throw error;
    }
  }

  /**
   * 문장 단위로 분리
   * - 마침표, 물음표, 느낌표 기준
   * - 너무 짧은 문장은 다음 문장과 합침
   */
  splitIntoSentences(script: string): string[] {
    // 문장 부호 기준 분리
    const rawSentences = script
      .split(/(?<=[.!?])\s*/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    if (rawSentences.length === 0) {
      return [script.trim()];
    }

    // 너무 짧은 문장(2초 미만) 합치기
    const MIN_CHARS = Math.round(2 * CHARS_PER_SEC); // 약 9글자
    const MAX_CHARS = Math.round(8 * CHARS_PER_SEC); // 약 36글자
    
    const sentences: string[] = [];
    let currentSentence = '';

    for (const sentence of rawSentences) {
      const combinedLength = currentSentence.length + sentence.length;
      
      if (currentSentence.length === 0) {
        currentSentence = sentence;
      } else if (currentSentence.length < MIN_CHARS && combinedLength <= MAX_CHARS) {
        // 현재 문장이 너무 짧고, 합쳐도 최대 길이 이하면 합침
        currentSentence += ' ' + sentence;
      } else {
        // 현재 문장 저장하고 새로 시작
        sentences.push(currentSentence);
        currentSentence = sentence;
      }
    }

    // 마지막 문장 처리
    if (currentSentence.length > 0) {
      // 마지막 문장이 너무 짧으면 이전 문장과 합침
      if (currentSentence.length < MIN_CHARS && sentences.length > 0) {
        const lastSentence = sentences.pop()!;
        if (lastSentence.length + currentSentence.length <= MAX_CHARS) {
          sentences.push(lastSentence + ' ' + currentSentence);
        } else {
          sentences.push(lastSentence);
          sentences.push(currentSentence);
        }
      } else {
        sentences.push(currentSentence);
      }
    }

    return sentences;
  }

  /**
   * 텍스트의 예상 TTS 길이 계산 (밀리초)
   */
  calculateDurationMs(text: string): number {
    const charCount = text.replace(/\s/g, '').length;
    return Math.round((charCount / CHARS_PER_SEC) * 1000);
  }

  /**
   * 문장 배열을 Scene 배열로 변환
   */
  createScenesFromSentences(sentences: string[]): Scene[] {
    return sentences.map((text, index) => ({
      id: index + 1,
      text,
      audioDurationMs: this.calculateDurationMs(text),
      videoStatus: 'pending' as const,
    }));
  }

  /**
   * 스크립트 수정 (사용자가 직접 편집한 경우)
   */
  updateScript(fullScript: string): ScriptResult {
    const sentences = this.splitIntoSentences(fullScript.trim());
    const estimatedDurationMs = this.calculateDurationMs(fullScript);
    
    return {
      fullScript: fullScript.trim(),
      sentences,
      estimatedDurationMs,
    };
  }
}

// 싱글톤 인스턴스
let scriptManagerInstance: ScriptManager | null = null;

export function getScriptManager(aiModel?: 'claude' | 'gpt-5' | 'gemini'): ScriptManager {
  if (!scriptManagerInstance || aiModel) {
    scriptManagerInstance = new ScriptManager(aiModel);
  }
  return scriptManagerInstance;
}

