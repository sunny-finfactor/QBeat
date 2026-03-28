import type { MusicProvider } from "@/app/types";

function readBooleanEnv(value: string | undefined, fallback: boolean) {
  if (value == null || value === "") {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export const appConfig = {
  deploymentTarget: "vercel",
  roomCodeLength: 6,
  roomExpiryHours: 2,
  voteMode: "permanent" as const,
  searchDebounceMs: 350,
  providers: {
    youtube: {
      enabled: readBooleanEnv(process.env.NEXT_PUBLIC_ENABLE_YOUTUBE_MUSIC, true),
      label: "YouTube Music",
    },
    spotify: {
      enabled: readBooleanEnv(process.env.NEXT_PUBLIC_ENABLE_SPOTIFY, false),
      label: "Spotify",
    },
  },
};

export function getEnabledProviders() {
  return (Object.entries(appConfig.providers) as Array<
    [MusicProvider, { enabled: boolean; label: string }]
  >)
    .filter(([, providerConfig]) => providerConfig.enabled)
    .map(([provider]) => provider);
}

export function isProviderEnabled(provider: MusicProvider) {
  return appConfig.providers[provider].enabled;
}
