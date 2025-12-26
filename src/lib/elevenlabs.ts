/**
 * ElevenLabs TTS API를 이용한 음성 생성
 * 
 * 스크립트를 자연스러운 한국어 음성으로 변환합니다.
 */

import axios from 'axios';
import type { GenerateTTSParams, TTSResult } from '@/types';

const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';

/**
 * 환경변수에서 API 키를 가져옵니다.
 */
function getApiKey(): string {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY 환경변수가 설정되지 않았습니다.');
  }
  return apiKey;
}

/**
 * 기본 Voice ID를 가져옵니다.
 */
function getDefaultVoiceId(): string {
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!voiceId) {
    throw new Error('ELEVENLABS_VOICE_ID 환경변수가 설정되지 않았습니다.');
  }
  return voiceId;
}

/**
 * ElevenLabs TTS API를 호출하여 음성을 생성합니다.
 * 
 * @param params - TTS 생성 파라미터
 * @returns 생성된 오디오 버퍼와 파일명
 */
export async function generateTTS(params: GenerateTTSParams): Promise<TTSResult> {
  const { script, voiceId } = params;
  
  const apiKey = getApiKey();
  const targetVoiceId = voiceId || getDefaultVoiceId();
  
  const endpoint = `${ELEVENLABS_API_BASE}/text-to-speech/${targetVoiceId}`;
  
  try {
    // fetch 사용 (axios 대신)
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text: script,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true
        }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = 'Unknown error';
      try {
        const parsed = JSON.parse(errorText);
        errorMessage = parsed.detail?.message || parsed.message || errorText;
      } catch {
        errorMessage = errorText || `HTTP ${response.status}`;
      }
      throw new Error(`ElevenLabs API 오류 (${response.status}): ${errorMessage}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);
    const timestamp = Date.now();
    const fileName = `tts-${timestamp}.mp3`;

    return {
      audioBuffer,
      fileName,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`ElevenLabs API 오류: ${String(error)}`);
  }
}

/**
 * 사용 가능한 음성 목록을 가져옵니다. (선택적 유틸리티)
 */
export async function listVoices(): Promise<Array<{ voice_id: string; name: string }>> {
  const apiKey = getApiKey();
  
  try {
    const response = await axios.get(`${ELEVENLABS_API_BASE}/voices`, {
      headers: {
        'xi-api-key': apiKey,
      },
    });
    
    return response.data.voices.map((voice: { voice_id: string; name: string }) => ({
      voice_id: voice.voice_id,
      name: voice.name,
    }));
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(`ElevenLabs API 오류: ${error.response?.status} - ${error.message}`);
    }
    throw error;
  }
}




