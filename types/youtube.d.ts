declare namespace YT {
  interface PlayerOptions {
    height?: string | number;
    width?: string | number;
    videoId?: string;
    playerVars?: {
      autoplay?: number;
      controls?: number;
      disablekb?: number;
      enablejsapi?: number;
      fs?: number;
      modestbranding?: number;
      rel?: number;
    };
    events?: {
      onStateChange?: (event: { data: number }) => void;
      onReady?: () => void;
    };
  }

  class Player {
    constructor(elementId: string, options: PlayerOptions);
    loadVideoById(videoId: string, startSeconds?: number): void;
    seekTo(seconds: number, allowSeekAhead: boolean): void;
    playVideo(): void;
    pauseVideo(): void;
    setVolume(volume: number): void;
    getCurrentTime(): number;
    getDuration(): number;
    getPlayerState(): number;
    destroy(): void;
  }

  namespace PlayerState {
    const ENDED: number;
    const PLAYING: number;
    const PAUSED: number;
  }
}

interface Window {
  onYouTubeIframeAPIReady: () => void;
  YT: typeof YT;
} 
