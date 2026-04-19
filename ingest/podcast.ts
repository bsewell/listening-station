import Parser from "rss-parser";
import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const parser = new Parser();

export interface PodcastEpisode {
  title: string;
  author: string;
  publishedAt: string;
  duration: string;
  description: string;
  audioUrl: string;
  episodeUrl: string;
}

export interface PodcastIngestResult {
  episode: PodcastEpisode;
  transcript: string | null;
  audioPath: string | null;
}

/**
 * Parse an RSS feed and return all episodes
 */
export async function parseFeed(feedUrl: string): Promise<PodcastEpisode[]> {
  const feed = await parser.parseURL(feedUrl);

  return (feed.items || []).map((item) => ({
    title: item.title || "Untitled",
    author: feed.title || item.creator || "Unknown",
    publishedAt: item.pubDate
      ? new Date(item.pubDate).toISOString()
      : new Date().toISOString(),
    duration: item.itunes?.duration || "0",
    description: item.contentSnippet || item.content || "",
    audioUrl: item.enclosure?.url || "",
    episodeUrl: item.link || "",
  }));
}

/**
 * Get a specific episode by title search or index
 */
export async function getEpisode(
  feedUrl: string,
  query: string | number
): Promise<PodcastEpisode | null> {
  const episodes = await parseFeed(feedUrl);

  if (typeof query === "number") {
    return episodes[query] || null;
  }

  const lower = query.toLowerCase();
  return (
    episodes.find(
      (ep) =>
        ep.title.toLowerCase().includes(lower) ||
        ep.description.toLowerCase().includes(lower)
    ) || null
  );
}

/**
 * Download podcast audio for Whisper transcription
 */
export async function downloadEpisodeAudio(
  audioUrl: string,
  slug: string
): Promise<string> {
  const tmpDir = join(process.cwd(), "downloads");
  if (!existsSync(tmpDir)) await mkdir(tmpDir, { recursive: true });

  const ext = audioUrl.includes(".m4a") ? "m4a" : "mp3";
  const outPath = join(tmpDir, `${slug}.${ext}`);

  const response = await fetch(audioUrl);
  if (!response.ok) {
    throw new Error(`Failed to download audio: ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(outPath, buffer);

  return outPath;
}

/**
 * Try to find an existing transcript for a podcast episode
 * Many popular podcasts publish transcripts on their websites
 */
export async function findExistingTranscript(
  episodeUrl: string
): Promise<string | null> {
  if (!episodeUrl) return null;

  try {
    const response = await fetch(episodeUrl, {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;

    const html = await response.text();

    // Check for common transcript patterns in podcast pages
    // Many NPR shows, for example, include transcripts inline
    const transcriptPatterns = [
      /<div[^>]*class="[^"]*transcript[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<section[^>]*class="[^"]*transcript[^"]*"[^>]*>([\s\S]*?)<\/section>/i,
      /<article[^>]*class="[^"]*transcript[^"]*"[^>]*>([\s\S]*?)<\/article>/i,
    ];

    for (const pattern of transcriptPatterns) {
      const match = html.match(pattern);
      if (match) {
        // Strip HTML tags to get clean text
        return match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Full podcast episode ingestion
 */
export async function ingestPodcastEpisode(
  feedUrl: string,
  query: string | number
): Promise<PodcastIngestResult> {
  const episode = await getEpisode(feedUrl, query);
  if (!episode) {
    throw new Error(`Episode not found: ${query}`);
  }

  // Try to find existing transcript
  const existingTranscript = await findExistingTranscript(episode.episodeUrl);
  if (existingTranscript) {
    return {
      episode,
      transcript: existingTranscript,
      audioPath: null,
    };
  }

  // Download audio for Whisper
  const slug = episode.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 60);
  const audioPath = await downloadEpisodeAudio(episode.audioUrl, slug);

  return {
    episode,
    transcript: null,
    audioPath,
  };
}
