/**
 * Transcript Finder — tries to locate existing transcripts before
 * falling back to Whisper transcription (which is slower and heavier).
 *
 * Strategy:
 * 1. YouTube: auto-generated captions via yt-dlp
 * 2. Podcasts: scrape episode page for transcript divs
 * 3. Articles: already text — no transcription needed
 * 4. Fallback: download audio → Meeting Transcriber MCP → Whisper
 */

import { getExistingTranscript as getYouTubeTranscript } from "./youtube.js";
import { findExistingTranscript as getPodcastTranscript } from "./podcast.js";

export type SourceType = "youtube" | "podcast" | "article";

export interface TranscriptResult {
  transcript: string;
  method: "existing" | "whisper" | "scrape";
}

/**
 * Detect source type from URL
 */
export function detectSourceType(url: string): SourceType {
  const u = new URL(url);
  const host = u.hostname.toLowerCase();

  if (
    host.includes("youtube.com") ||
    host.includes("youtu.be") ||
    host.includes("youtube-nocookie.com")
  ) {
    return "youtube";
  }

  // Common podcast platforms
  if (
    host.includes("podcasts.apple.com") ||
    host.includes("open.spotify.com") ||
    host.includes("overcast.fm") ||
    host.includes("pocketcasts.com") ||
    host.includes("castro.fm")
  ) {
    return "podcast";
  }

  // RSS feed URLs
  if (url.endsWith(".rss") || url.endsWith("/feed") || url.includes("/rss")) {
    return "podcast";
  }

  // Default to article
  return "article";
}

/**
 * Try to find an existing transcript for any URL
 * Returns null if no transcript found (caller should use Whisper)
 */
export async function findTranscript(
  url: string,
  sourceType: SourceType
): Promise<TranscriptResult | null> {
  switch (sourceType) {
    case "youtube": {
      const transcript = await getYouTubeTranscript(url);
      if (transcript) {
        return { transcript, method: "existing" };
      }
      return null;
    }

    case "podcast": {
      const transcript = await getPodcastTranscript(url);
      if (transcript) {
        return { transcript, method: "existing" };
      }
      return null;
    }

    case "article":
      // Articles are already text — handled by article.ts ingest
      return null;

    default:
      return null;
  }
}
