/**
 * POST /api/recommend-topic
 * 
 * 카테고리별 인기 주제 추천 API
 * 50-60대 시청자에게 조회수가 높을 만한 주제를 AI가 추천합니다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { generate } from '@/lib/openrouter';

interface RecommendRequest {
  category: string;
  count?: number;
}

interface TopicRecommendation {
  topic: string;
  reason: string;
  hook: string;  // 시선 끄는 도입부
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as RecommendRequest;
    const { category, count = 3 } = body;

    if (!category) {
      return NextResponse.json(
        { success: false, error: '카테고리를 선택해주세요.' },
        { status: 400 }
      );
    }

    // 카테고리 한글 매핑
    const categoryLabels: Record<string, string> = {
      health: '건강/의료',
      finance: '재테크/금융',
      healing: '힐링/마음건강',
      lifestyle: '라이프스타일',
      hobby: '취미/여가',
      travel: '여행',
      food: '요리/음식',
      culture: '문화/역사',
      tech: '디지털/IT',
      etc: '기타',
    };

    const categoryLabel = categoryLabels[category] || category;

    console.log(`[RecommendTopic] 카테고리: ${categoryLabel}, 추천 개수: ${count}`);

    const systemPrompt = `당신은 YouTube Shorts 트렌드 분석 전문가입니다.
50-60대 한국인 시청자를 타겟으로 하는 채널의 콘텐츠 기획을 담당합니다.

당신의 임무:
- 해당 연령대가 실제로 관심 있어하고 클릭할 만한 주제를 추천
- 검색량, 트렌드, 실용성을 고려한 주제 선정
- 유튜브 쇼츠 알고리즘에 유리한 주제 (참여도 높은 주제)

주제 선정 기준:
1. 50-60대의 현실적인 고민/관심사 반영
2. "나도 해봐야겠다" 싶은 실용적인 정보
3. 가족에게 공유하고 싶은 내용
4. 시즌/계절/시기에 맞는 주제 우선
5. 제목만 봐도 클릭하고 싶은 호기심 유발`;

    const userPrompt = `[${categoryLabel}] 카테고리에서 50-60대 시청자에게 조회수가 높을 것 같은 YouTube Shorts 주제를 ${count}개 추천해주세요.

현재 시기: ${new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}

다음 JSON 형식으로만 응답하세요:
{
  "recommendations": [
    {
      "topic": "영상 제작에 바로 사용할 수 있는 구체적인 주제",
      "reason": "이 주제가 인기 있을 이유 (1-2문장)",
      "hook": "영상 시작 시 시선을 끄는 도입부 예시"
    }
  ]
}

주제 작성 시 주의사항:
- "~하는 법", "~비결", "~꿀팁" 등 실용적인 형태로 작성
- 구체적인 숫자나 기간을 포함하면 좋음 (예: "3가지", "1주일", "5분")
- 50-60대가 실제로 검색할 만한 자연스러운 표현 사용`;

    const response = await generate({
      task: 'script',  // Claude 3.5 Sonnet 사용
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.9,  // 다양한 추천을 위해 높은 temperature
      maxTokens: 1024,
    });

    // JSON 파싱
    let recommendations: TopicRecommendation[] = [];
    
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        recommendations = parsed.recommendations || [];
      }
    } catch (parseError) {
      console.error('[RecommendTopic] JSON 파싱 실패:', parseError);
      
      // 파싱 실패 시 기본 추천
      recommendations = [
        {
          topic: `50대를 위한 ${categoryLabel} 꿀팁 3가지`,
          reason: '실용적인 정보를 원하는 50대 시청자에게 적합합니다.',
          hook: '이것만 알면 인생이 달라집니다!',
        },
      ];
    }

    console.log(`[RecommendTopic] 추천 완료: ${recommendations.length}개`);

    return NextResponse.json({
      success: true,
      category: categoryLabel,
      recommendations,
    });

  } catch (error) {
    console.error('[RecommendTopic] 오류:', error);

    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : '주제 추천 중 오류가 발생했습니다.',
      },
      { status: 500 }
    );
  }
}


