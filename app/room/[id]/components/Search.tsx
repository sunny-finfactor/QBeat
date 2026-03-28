"use client";

import Image from "next/image";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { MusicProvider, SearchSong } from "@/app/types";
import { appConfig, getEnabledProviders } from "@/lib/qbeat/config";

interface SearchProps {
  onAddSong: (song: SearchSong) => Promise<void>;
}

function formatDuration(durationSeconds: number | null) {
  if (!durationSeconds) {
    return "Unknown";
  }

  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function Search({ onAddSong }: SearchProps) {
  const enabledProviders = useMemo(() => getEnabledProviders(), []);
  const [provider, setProvider] = useState<MusicProvider>(enabledProviders[0] ?? "youtube");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchSong[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const deferredQuery = useDeferredValue(query.trim());

  useEffect(() => {
    if (!enabledProviders.includes(provider)) {
      setProvider(enabledProviders[0] ?? "youtube");
    }
  }, [enabledProviders, provider]);

  useEffect(() => {
    const activeQuery = deferredQuery;

    if (!activeQuery) {
      setResults([]);
      setError("");
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      setIsLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/api/music/search?${new URLSearchParams({
            q: activeQuery,
            provider,
          })}`,
        );

        if (!response.ok) {
          const payload = await response.json().catch(() => ({ error: "Search failed." }));
          throw new Error(payload.error ?? "Search failed.");
        }

        setResults((await response.json()) as SearchSong[]);
      } catch (searchError) {
        setError(searchError instanceof Error ? searchError.message : "Search failed.");
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, appConfig.searchDebounceMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [deferredQuery, provider]);

  const handleAddSong = async (song: SearchSong) => {
    try {
      await onAddSong(song);
      setResults([]);
      setQuery("");
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "Failed to add track.");
    }
  };

  return (
    <section className="glass-panel rounded-[28px] p-4 sm:p-5">
      <div className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="min-w-0 flex-1 space-y-2">
            <p className="section-kicker">Add song</p>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${appConfig.providers[provider].label}`}
              className="w-full border-0 border-b border-[var(--line-strong)] bg-transparent px-0 py-3 text-base text-[var(--text)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-0"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {enabledProviders.map((enabledProvider) => {
              const active = provider === enabledProvider;
              return (
                <button
                  key={enabledProvider}
                  type="button"
                  onClick={() => setProvider(enabledProvider)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    active
                      ? "bg-[var(--text)] text-white"
                      : "border border-[var(--line)] bg-transparent text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text)]"
                  }`}
                >
                  {appConfig.providers[enabledProvider].label}
                </button>
              );
            })}
          </div>
        </div>

        {isLoading ? <p className="text-sm text-[var(--text-muted)]">Searching...</p> : null}

        {error ? (
          <div className="rounded-[18px] border border-[rgba(194,64,50,0.18)] bg-[rgba(194,64,50,0.08)] px-4 py-3 text-sm text-[var(--danger)]">
            {error}
          </div>
        ) : null}

        {results.length > 0 ? (
          <div className="space-y-2 lg:max-h-[15rem] lg:overflow-y-auto lg:pr-1">
            {results.map((song) => (
              <article
                key={`${song.provider}:${song.providerTrackId}`}
                className="soft-card rounded-[20px] px-3 py-3"
              >
                <div className="flex items-center gap-3">
                  <Image
                    src={song.thumbnailUrl}
                    alt={song.title}
                    width={44}
                    height={44}
                    className="h-11 w-11 rounded-[14px] object-cover"
                  />

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[var(--text)]">{song.title}</p>
                    <p className="truncate text-sm text-[var(--text-muted)]">{song.artist}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">
                      {formatDuration(song.durationSeconds)}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleAddSong(song)}
                    className="rounded-full bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[var(--accent-strong)]"
                  >
                    Add
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {!deferredQuery && !isLoading ? (
          <p className="text-sm text-[var(--text-muted)]">
            Search for a song and add it straight into the room.
          </p>
        ) : null}

        {!isLoading && deferredQuery && results.length === 0 && !error ? (
          <p className="text-sm text-[var(--text-muted)]">No results found for this search.</p>
        ) : null}
      </div>
    </section>
  );
}
