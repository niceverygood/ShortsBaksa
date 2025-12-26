/**
 * Google Imagen 3 API를 이용한 이미지 생성
 * 
 * 스크립트를 기반으로 장면별 이미지를 생성합니다.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';

// Google AI 클라이언트
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
 * 스크립트에서 장면 프롬프트를 추출합니다.
 */
export async function extractScenePrompts(script: string, sceneCount: number = 5): Promise<string[]> {
  const client = getGoogleAIClient();
  const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = `다음 스크립트를 ${sceneCount}개의 장면으로 나누고, 각 장면에 맞는 이미지 생성 프롬프트를 영어로 작성해주세요.

스크립트:
${script}

요구사항:
- 각 프롬프트는 50-60대 한국인 시청자를 위한 따뜻하고 친근한 이미지여야 합니다.
- 고품질의 사진처럼 사실적인 이미지를 위한 프롬프트를 작성하세요.
- 각 프롬프트는 영어로 작성하고, 한 줄에 하나씩 출력하세요.
- 프롬프트만 출력하고 다른 설명은 포함하지 마세요.
- 각 프롬프트는 "Professional photograph, warm lighting, Korean senior adult," 로 시작하세요.

예시 출력:
Professional photograph, warm lighting, Korean senior adult, healthy lifestyle, morning stretching in a park
Professional photograph, warm lighting, Korean senior adult, reading health magazine in cozy living room`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response.text();
    
    const prompts = response
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && line.toLowerCase().startsWith('professional'));
    
    // 요청한 개수만큼 반환 (부족하면 기본 프롬프트로 채움)
    while (prompts.length < sceneCount) {
      prompts.push('Professional photograph, warm lighting, Korean senior adult, healthy lifestyle, peaceful moment');
    }
    
    return prompts.slice(0, sceneCount);
  } catch (error) {
    console.error('장면 프롬프트 추출 실패:', error);
    // 기본 프롬프트 반환
    return Array(sceneCount).fill(
      'Professional photograph, warm lighting, Korean senior adult, healthy lifestyle, peaceful moment'
    );
  }
}

/**
 * Google Imagen 3 API로 이미지를 생성합니다.
 */
export async function generateImage(prompt: string): Promise<Buffer> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_AI_API_KEY 환경변수가 설정되지 않았습니다.');
  }

  // Imagen 3 API 엔드포인트
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:generateImage?key=${apiKey}`;

  try {
    const response = await axios.post(
      endpoint,
      {
        prompt: prompt,
        number_of_images: 1,
        aspect_ratio: '9:16', // 쇼츠 세로 비율
        safety_filter_level: 'block_medium_and_above',
        person_generation: 'allow_adult',
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      }
    );

    // 응답에서 이미지 데이터 추출
    const imageData = response.data.generated_images?.[0]?.image?.image_bytes;
    
    if (!imageData) {
      throw new Error('이미지 생성 응답에 이미지 데이터가 없습니다.');
    }

    return Buffer.from(imageData, 'base64');
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const statusCode = error.response?.status;
      const errorMessage = error.response?.data?.error?.message || error.message;
      
      // Imagen API가 사용 불가능한 경우 대체 방법 사용
      if (statusCode === 404 || statusCode === 400) {
        console.log('Imagen 3 API 사용 불가, 대체 이미지 생성 중...');
        return await generatePlaceholderImage(prompt);
      }
      
      throw new Error(`Imagen API 오류 (${statusCode}): ${errorMessage}`);
    }
    throw error;
  }
}

/**
 * 대체 이미지 생성 (플레이스홀더)
 * Imagen API가 사용 불가능할 때 사용
 */
async function generatePlaceholderImage(prompt: string): Promise<Buffer> {
  const width = 720;
  const height = 1280;
  
  // 프롬프트에서 키워드 추출
  const keywords = extractKeywords(prompt);
  
  // 여러 이미지 소스 시도
  const imageSources = [
    // Unsplash Source - 키워드 기반 이미지
    `https://source.unsplash.com/${width}x${height}/?${encodeURIComponent(keywords)}`,
    // Picsum Photos (Lorem Picsum) - 랜덤 이미지
    `https://picsum.photos/${width}/${height}?random=${Date.now()}`,
    // Picsum 정적 이미지 (특정 ID)
    `https://picsum.photos/id/${Math.floor(Math.random() * 1000)}/${width}/${height}`,
  ];
  
  for (const url of imageSources) {
    try {
      console.log(`[Imagen] 대체 이미지 가져오기: ${url}`);
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000,
        maxRedirects: 10,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        },
        validateStatus: (status) => status >= 200 && status < 400,
      });
      
      // JPEG/PNG 데이터인지 확인
      const buffer = Buffer.from(response.data);
      
      // JPEG 시그니처: FF D8 FF 또는 PNG 시그니처: 89 50 4E 47
      const isJpeg = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
      const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
      
      if ((isJpeg || isPng) && buffer.length > 5000) {
        console.log(`[Imagen] 대체 이미지 성공: ${buffer.length} bytes, ${isJpeg ? 'JPEG' : 'PNG'}`);
        return buffer;
      } else {
        console.warn(`[Imagen] 유효하지 않은 이미지 데이터: ${buffer.length} bytes`);
      }
    } catch (error) {
      console.warn(`[Imagen] 이미지 소스 실패: ${url}`, error instanceof Error ? error.message : error);
      continue;
    }
  }
  
  // 모든 소스 실패 시 기본 JPEG 이미지 생성
  console.log('[Imagen] 모든 소스 실패, 기본 이미지 생성');
  return createMinimalJpeg(width, height);
}

/**
 * 프롬프트에서 검색 키워드 추출
 */
function extractKeywords(prompt: string): string {
  // 건강 관련 키워드 매핑
  const keywordMap: Record<string, string> = {
    'health': 'healthy senior wellness',
    'eye': 'eye care vision health',
    'blood pressure': 'heart health senior',
    'exercise': 'senior exercise walking',
    'memory': 'brain health senior',
    'nutrition': 'healthy food senior',
    'sleep': 'peaceful sleep relaxation',
    'meditation': 'meditation calm peaceful',
  };
  
  const lowerPrompt = prompt.toLowerCase();
  for (const [key, value] of Object.entries(keywordMap)) {
    if (lowerPrompt.includes(key)) {
      return value;
    }
  }
  
  return 'senior health wellness peaceful';
}

/**
 * 최소한의 JPEG 이미지 생성 (외부 라이브러리 없이)
 * 브라우저 호환성을 위해 유효한 JPEG 헤더 포함
 */
function createMinimalJpeg(width: number, height: number): Buffer {
  // 1x1 베이지색 JPEG를 base64로 인코딩한 것
  // 실제로는 FFmpeg가 이를 스케일링해서 사용
  const beige1x1Jpeg = Buffer.from(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof' +
    'Hh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwh' +
    'MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAAR' +
    'CAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAA' +
    'AAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMB' +
    'AAIRAxEAPwCwAB//2Q==',
    'base64'
  );
  
  return beige1x1Jpeg;
}

/**
 * 여러 장면의 이미지를 생성합니다.
 */
export async function generateSceneImages(
  script: string,
  outputDir: string,
  sceneCount: number = 5
): Promise<string[]> {
  // 디렉터리 생성
  await fs.mkdir(outputDir, { recursive: true });
  
  // 장면 프롬프트 추출
  console.log('[Imagen] 장면 프롬프트 추출 중...');
  const prompts = await extractScenePrompts(script, sceneCount);
  
  const imagePaths: string[] = [];
  
  for (let i = 0; i < prompts.length; i++) {
    console.log(`[Imagen] 이미지 ${i + 1}/${prompts.length} 생성 중...`);
    
    try {
      const imageBuffer = await generateImage(prompts[i]);
      const fileName = `scene_${String(i + 1).padStart(2, '0')}.jpg`;
      const filePath = path.join(outputDir, fileName);
      
      await fs.writeFile(filePath, imageBuffer);
      imagePaths.push(filePath);
      
      // API 레이트 리밋 방지
      if (i < prompts.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error(`[Imagen] 이미지 ${i + 1} 생성 실패:`, error);
      // 실패한 이미지는 건너뛰고 계속 진행
    }
  }
  
  if (imagePaths.length === 0) {
    throw new Error('이미지를 하나도 생성하지 못했습니다.');
  }
  
  return imagePaths;
}

