import { NextRequest, NextResponse } from 'next/server';

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q');

  if (!query) {
    return NextResponse.json({ error: 'Query parameter is required' }, { status: 400 });
  }

  if (!YOUTUBE_API_KEY) {
    return NextResponse.json(
      { error: 'YouTube API key is not configured' },
      { status: 500 }
    );
  }

  try {
    // Search YouTube using the Data API with improved parameters
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?` +
      new URLSearchParams({
        part: 'snippet',
        maxResults: '10',
        q: query + ' music', // Add 'music' to improve results
        type: 'video',
        videoCategoryId: '10', // Music category
        videoEmbeddable: 'true', // Only get embeddable videos
        videoSyndicated: 'true', // Only get videos that can be played on other sites
        key: YOUTUBE_API_KEY,
        relevanceLanguage: 'en', // Prioritize English results
        regionCode: 'US', // Prioritize US region
        safeSearch: 'moderate' // Filter out inappropriate content
      })
    );

    if (!response.ok) {
      throw new Error('Failed to search YouTube');
    }

    const data = await response.json();
    
    // Format the results to match the expected format in Search component
    const formattedResults = data.items.map((item: any) => ({
      id: item.id.videoId,
      name: item.snippet.title,
      artist: item.snippet.channelTitle,
      image: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url,
      youtubeId: item.id.videoId
    }));

    return NextResponse.json(formattedResults);
  } catch (error) {
    console.error('YouTube search error:', error);
    return NextResponse.json(
      { error: 'Failed to search YouTube' },
      { status: 500 }
    );
  }
} 