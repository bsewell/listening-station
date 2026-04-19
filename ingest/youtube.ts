import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { readFile, mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";

const exec = promisify(execFile);

export interface YouTubeMetadata {
  id: string;
  title: string;
  author: string;
  publishedAt: string;
  duration: number;
  description: string;
  thumbnailUrl: string;
}

export interface YouTubeIngestResult {
  metadata: YouTubeMetadata;
  transcript: string | null;
  transcriptMethod: "existing" | "whisper" | null;
  audioPath: string | null;
}

/**
 * Extract metadata from a YouTube URL using yt-dlp
 */
export async function getMetadata(url: string): Promise<YouTubeMetadata> {
  const { stdout } = await exec("yt-dlp", [
    "--dump-json",
    "--no-download",
    url,
  ]);

  const data = JSON.parse(stdout);

  return {
    id: data.id,
    title: data.title,
    author: data.uploader || data.channel,
    publishedAt: data.upload_date
      ? `${data.upload_date.slice(0, 4)}-${data.upload_date.slice(4, 6)}-${data.upload_date.slice(6, 8)}`
      : new Date().toISOString().slice(0, 10),
    duration: data.duration || 0,
    description: data.description || "",
    thumbnailUrl: data.thumbnail || "",
  };
}

/**
 * Try to get existing captions/subtitles from YouTube
 */
export async function getExistingTranscript(
  url: string
): Promise<string | null> {
  const tmpDir = join(process.cwd(), "downloads");
  if (!existsSync(tmpDir)) await mkdir(tmpDir, { recursive: true });

  const outPath = join(tmpDir, "caption_temp");

  try {
    // Try auto-generated captions first, then manual subs
    await exec("yt-dlp", [
      "--write-auto-sub",
      "--write-sub",
      "--sub-lang",
      "en",
      "--sub-format",
      "vtt",
      "--skip-download",
      "-o",
      outPath,
      url,
    ]);

    // Look for the generated subtitle file
    const vttPath = `${outPath}.en.vtt`;
    if (existsSync(vttPath)) {
      const vtt = await readFile(vttPath, "utf-8");
      const transcript = parseVTT(vtt);
      await unlink(vttPath).catch(() => {});
      return transcript;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Download audio for Whisper transcription
 */
export async function downloadAudio(url: string): Promise<string> {
  const tmpDir = join(process.cwd(), "downloads");
  if (!existsSync(tmpDir)) await mkdir(tmpDir, { recursive: true });

  const outTemplate = join(tmpDir, "%(id)s.%(ext)s");

  await exec("yt-dlp", [
    "-x",
    "--audio-format",
    "mp3",
    "--audio-quality",
    "0",
    "-o",
    outTemplate,
    url,
  ]);

  // Find the downloaded file
  const { stdout } = await exec("yt-dlp", [
    "--get-id",
    url,
  ]);
  const videoId = stdout.trim();
  const audioPath = join(tmpDir, `${videoId}.mp3`);

  if (!existsSync(audioPath)) {
    throw new Error(`Audio download failed: expected file at ${audioPath}`);
  }

  return audioPath;
}

/**
 * Full YouTube ingestion: metadata + transcript (existing or audio for Whisper)
 */
export async function ingestYouTube(
  url: string
): Promise<YouTubeIngestResult> {
  const metadata = await getMetadata(url);

  // Try existing captions first (faster, free)
  const existingTranscript = await getExistingTranscript(url);
  if (existingTranscript) {
    return {
      metadata,
      transcript: existingTranscript,
      transcriptMethod: "existing",
      audioPath: null,
    };
  }

  // Fall back to downloading audio for Whisper
  const audioPath = await downloadAudio(url);
  return {
    metadata,
    transcript: null,
    transcriptMethod: null,
    audioPath,
  };
}

/**
 * Parse VTT subtitle format into clean text
 */
function parseVTT(vtt: string): string {
  const lines = vtt.split("\n");
  const textLines: string[] = [];
  let lastLine = "";

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip headers, timestamps, and empty lines
    if (
      !trimmed ||
      trimmed === "WEBVTT" ||
      trimmed.includes("-->") ||
      trimmed.startsWith("Kind:") ||
      trimmed.startsWith("Language:") ||
      /^\d+$/.test(trimmed)
    ) {
      continue;
    }

    // Remove VTT formatting tags
    const clean = trimmed
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .trim();

    // Deduplicate (auto-captions often repeat lines)
    if (clean && clean !== lastLine) {
      textLines.push(clean);
      lastLine = clean;
    }
  }

  return textLines.join(" ");
}
