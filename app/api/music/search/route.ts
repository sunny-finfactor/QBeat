import { NextRequest, NextResponse } from "next/server";
import type { MusicProvider, SearchSong } from "@/app/types";
import { isProviderEnabled } from "@/lib/qbeat/config";

let spotifyTokenCache: { accessToken: string; expiresAt: number } | null = null;

function normalizeProvider(rawProvider: string | null): MusicProvider {
  return rawProvider === "spotify" ? "spotify" : "youtube";
}

function mapYoutubeResults(payload: any): SearchSong[] {
  return (payload.items ?? []).map((item: any) => ({
    provider: "youtube",
    providerTrackId: item.id.videoId,
    title: item.snippet.title,
    artist: item.snippet.channelTitle,
    thumbnailUrl:
      item.snippet.thumbnails.high?.url ??
      item.snippet.thumbnails.medium?.url ??
      item.snippet.thumbnails.default?.url ??
      "",
    durationSeconds: null,
  }));
}

async function searchYouTube(query: string) {
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    throw new Error("YOUTUBE_API_KEY is not configured.");
  }

  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/search?${new URLSearchParams({
      part: "snippet",
      maxResults: "12",
      q: `${query} music`,
      type: "video",
      videoCategoryId: "10",
      videoEmbeddable: "true",
      videoSyndicated: "true",
      relevanceLanguage: "en",
      regionCode: "US",
      safeSearch: "moderate",
      key: apiKey,
    })}`,
    {
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error("YouTube search failed.");
  }

  return mapYoutubeResults(await response.json());
}

async function getSpotifyAccessToken() {
  if (spotifyTokenCache && spotifyTokenCache.expiresAt > Date.now()) {
    return spotifyTokenCache.accessToken;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Spotify credentials are not configured.");
  }

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Spotify token request failed.");
  }

  const payload = await response.json();
  spotifyTokenCache = {
    accessToken: payload.access_token,
    expiresAt: Date.now() + payload.expires_in * 1000 - 15000,
  };

  return spotifyTokenCache.accessToken;
}

async function searchSpotify(query: string) {
  const accessToken = await getSpotifyAccessToken();
  const response = await fetch(
    `https://api.spotify.com/v1/search?${new URLSearchParams({
      q: query,
      type: "track",
      limit: "12",
    })}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error("Spotify search failed.");
  }

  const payload = await response.json();

  return (payload.tracks?.items ?? []).map((track: any) => ({
    provider: "spotify",
    providerTrackId: track.id,
    title: track.name,
    artist: track.artists?.map((artist: any) => artist.name).join(", ") ?? "Unknown artist",
    thumbnailUrl: track.album?.images?.[0]?.url ?? "",
    durationSeconds: track.duration_ms ? Math.round(track.duration_ms / 1000) : null,
  })) as SearchSong[];
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim();
  const provider = normalizeProvider(request.nextUrl.searchParams.get("provider"));

  if (!query) {
    return NextResponse.json({ error: "Query parameter is required." }, { status: 400 });
  }

  if (!isProviderEnabled(provider)) {
    return NextResponse.json({ error: `${provider} support is disabled.` }, { status: 400 });
  }

  try {
    const data = provider === "spotify" ? await searchSpotify(query) : await searchYouTube(query);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Music search error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Music search failed." },
      { status: 500 },
    );
  }
}
