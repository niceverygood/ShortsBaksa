/**
 * YouTube Data API를 이용한 영상 업로드
 * 
 * OAuth2 인증을 통해 YouTube에 영상을 업로드합니다.
 */

import { google, youtube_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import type { UploadToYoutubeParams, YouTubeUploadResult } from '@/types';

// OAuth2 클라이언트 (lazy initialization)
let oauth2Client: OAuth2Client | null = null;

/**
 * OAuth2 클라이언트를 초기화합니다.
 */
function getOAuth2Client(): OAuth2Client {
  if (!oauth2Client) {
    const clientId = process.env.YOUTUBE_CLIENT_ID;
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
    const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;

    if (!clientId) {
      throw new Error('YOUTUBE_CLIENT_ID 환경변수가 설정되지 않았습니다.');
    }
    if (!clientSecret) {
      throw new Error('YOUTUBE_CLIENT_SECRET 환경변수가 설정되지 않았습니다.');
    }
    if (!refreshToken) {
      throw new Error('YOUTUBE_REFRESH_TOKEN 환경변수가 설정되지 않았습니다.');
    }

    oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      'https://developers.google.com/oauthplayground' // Redirect URI
    );

    oauth2Client.setCredentials({
      refresh_token: refreshToken,
    });
  }

  return oauth2Client;
}

/**
 * YouTube API 클라이언트를 가져옵니다.
 */
function getYouTubeClient(): youtube_v3.Youtube {
  const auth = getOAuth2Client();
  return google.youtube({ version: 'v3', auth });
}

/**
 * URL에서 파일을 다운로드하여 임시 경로에 저장합니다.
 */
async function downloadToTemp(url: string, fileName: string): Promise<string> {
  const tmpDir = path.join(process.cwd(), 'tmp');
  
  // tmp 디렉터리 생성
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }
  
  const filePath = path.join(tmpDir, fileName);
  
  const response = await axios.get(url, {
    responseType: 'stream',
  });

  const writer = fs.createWriteStream(filePath);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', () => resolve(filePath));
    writer.on('error', reject);
  });
}

/**
 * 임시 파일을 삭제합니다.
 */
function cleanupTempFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.warn(`임시 파일 삭제 실패 (무시됨): ${filePath}`, error);
  }
}

/**
 * YouTube에 영상을 업로드합니다.
 * 
 * @param params - 업로드 파라미터
 * @returns 업로드된 영상의 URL과 ID
 */
export async function uploadToYoutube(params: UploadToYoutubeParams): Promise<YouTubeUploadResult> {
  const { 
    videoPathOrUrl, 
    title, 
    description = '', 
    tags = [], 
    privacyStatus = 'unlisted' 
  } = params;

  const youtube = getYouTubeClient();
  
  let videoPath: string;
  let shouldCleanup = false;

  // URL인 경우 다운로드
  if (videoPathOrUrl.startsWith('http://') || videoPathOrUrl.startsWith('https://')) {
    const fileName = `youtube-upload-${Date.now()}.mp4`;
    videoPath = await downloadToTemp(videoPathOrUrl, fileName);
    shouldCleanup = true;
  } else {
    videoPath = videoPathOrUrl;
  }

  // 파일 존재 확인
  if (!fs.existsSync(videoPath)) {
    throw new Error(`영상 파일을 찾을 수 없습니다: ${videoPath}`);
  }

  try {
    // 영상 업로드
    const response = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: title,
          description: description,
          tags: tags,
          categoryId: '22', // People & Blogs
          defaultLanguage: 'ko',
          defaultAudioLanguage: 'ko',
        },
        status: {
          privacyStatus: privacyStatus,
          selfDeclaredMadeForKids: false,
        },
      },
      media: {
        body: fs.createReadStream(videoPath),
      },
    });

    const videoId = response.data.id;
    
    if (!videoId) {
      throw new Error('YouTube에서 영상 ID를 반환하지 않았습니다.');
    }

    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

    return {
      youtubeUrl,
      youtubeVideoId: videoId,
    };
  } finally {
    // 임시 파일 정리
    if (shouldCleanup) {
      cleanupTempFile(videoPath);
    }
  }
}

/**
 * 채널 정보를 가져옵니다. (테스트용)
 */
export async function getChannelInfo(): Promise<{ id: string; title: string } | null> {
  const youtube = getYouTubeClient();
  
  try {
    const response = await youtube.channels.list({
      part: ['snippet'],
      mine: true,
    });

    const channel = response.data.items?.[0];
    if (!channel) {
      return null;
    }

    return {
      id: channel.id || '',
      title: channel.snippet?.title || '',
    };
  } catch (error) {
    console.error('채널 정보 조회 실패:', error);
    return null;
  }
}

/**
 * 업로드된 영상 정보를 가져옵니다.
 */
export async function getVideoInfo(videoId: string): Promise<{
  title: string;
  viewCount: string;
  likeCount: string;
} | null> {
  const youtube = getYouTubeClient();
  
  try {
    const response = await youtube.videos.list({
      part: ['snippet', 'statistics'],
      id: [videoId],
    });

    const video = response.data.items?.[0];
    if (!video) {
      return null;
    }

    return {
      title: video.snippet?.title || '',
      viewCount: video.statistics?.viewCount || '0',
      likeCount: video.statistics?.likeCount || '0',
    };
  } catch (error) {
    console.error('영상 정보 조회 실패:', error);
    return null;
  }
}





