/**
 * GET /api/test-openrouter
 * 
 * OpenRouter API 연결 테스트
 */

import { NextRequest, NextResponse } from 'next/server';
import { testConnection, AI_MODELS } from '@/lib/openrouter';

export async function GET(request: NextRequest) {
  // 환경변수 확인
  const apiKey = process.env.OPENROUTER_API_KEY;
  const hasKey = !!apiKey;
  const keyPreview = apiKey ? `${apiKey.substring(0, 15)}...` : 'NOT SET';
  
  console.log('[TestOpenRouter] API Key 존재:', hasKey);
  console.log('[TestOpenRouter] API Key 미리보기:', keyPreview);
  
  if (!hasKey) {
    return NextResponse.json({
      success: false,
      message: 'OPENROUTER_API_KEY가 설정되지 않았습니다.',
      hint: '.env.local 파일에 OPENROUTER_API_KEY를 추가하세요.',
    }, { status: 500 });
  }
  
  try {
    console.log('[TestOpenRouter] 연결 테스트 시작...');
    
    const isConnected = await testConnection();
    
    if (isConnected) {
      return NextResponse.json({
        success: true,
        message: 'OpenRouter 연결 성공!',
        models: AI_MODELS,
        keyPreview,
      });
    } else {
      return NextResponse.json({
        success: false,
        message: 'OpenRouter 연결 실패 (API 호출 오류)',
        keyPreview,
        hint: 'API 키가 유효한지 확인하세요.',
      }, { status: 500 });
    }
  } catch (error) {
    console.error('[TestOpenRouter] 오류:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류',
      keyPreview,
      hint: 'API 호출 중 오류가 발생했습니다.',
    }, { status: 500 });
  }
}

