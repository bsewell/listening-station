import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export async function POST(request: Request) {
  const supabase = createServerClient();

  let body: { url: string; tags: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { url, tags = [] } = body;

  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  // Check if already ingested
  const { data: existing } = await supabase
    .from("listening_station_sources")
    .select("id, status, title")
    .eq("url", url)
    .single();

  if (existing) {
    return NextResponse.json(
      {
        error: `Already ingested: "${existing.title}" (status: ${existing.status})`,
        id: existing.id,
      },
      { status: 409 }
    );
  }

  // Detect source type
  const sourceType = detectSourceType(url);

  let title: string | null = null;
  let author: string | null = null;
  let transcript: string | null = null;
  let transcriptMethod: string | null = null;
  let wordCount: number | null = null;
  let metadata: Record<string, unknown> = {};
  let status = "pending";

  if (sourceType === "youtube") {
    // Fetch metadata via yt-dlp (server-side)
    try {
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const exec = promisify(execFile);

      // Get metadata
      const { stdout: metaJson } = await exec("yt-dlp", [
        "--dump-json",
        "--no-download",
        url,
      ]);
      const meta = JSON.parse(metaJson);
      title = meta.title;
      author = meta.uploader || meta.channel;
      metadata = {
        videoId: meta.id,
        duration: meta.duration,
        description: meta.description?.slice(0, 500),
      };

      // Try to get captions
      const { stdout: subJson } = await exec("yt-dlp", [
        "--write-auto-sub",
        "--write-sub",
        "--sub-lang",
        "en",
        "--sub-format",
        "json3",
        "--skip-download",
        "--dump-json",
        url,
      ]).catch(() => ({ stdout: "" }));

      // Try auto-captions via yt-dlp subtitle extraction
      const tmpDir = "/tmp/ls-captions";
      const { mkdir } = await import("node:fs/promises");
      await mkdir(tmpDir, { recursive: true });

      try {
        await exec("yt-dlp", [
          "--write-auto-sub",
          "--write-sub",
          "--sub-lang",
          "en",
          "--sub-format",
          "vtt",
          "--skip-download",
          "-o",
          `${tmpDir}/cap`,
          url,
        ]);

        const { readFile, unlink } = await import("node:fs/promises");
        const { existsSync } = await import("node:fs");
        const vttPath = `${tmpDir}/cap.en.vtt`;

        if (existsSync(vttPath)) {
          const vtt = await readFile(vttPath, "utf-8");
          transcript = parseVTT(vtt);
          transcriptMethod = "existing";
          wordCount = transcript.split(/\s+/).length;
          status = "ready";
          await unlink(vttPath).catch(() => {});
        }
      } catch {
        // No captions available
      }
    } catch (err) {
      return NextResponse.json(
        { error: `yt-dlp failed: ${err instanceof Error ? err.message : "unknown error"}` },
        { status: 500 }
      );
    }
  } else if (sourceType === "article") {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
      });
      if (!res.ok) throw new Error(`Fetch failed: ${res.statusText}`);
      const html = await res.text();

      const { JSDOM } = await import("jsdom");
      const { Readability } = await import("@mozilla/readability");

      const dom = new JSDOM(html, { url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      if (article) {
        title = article.title ?? null;
        author = article.byline ?? null;
        transcript = (article.textContent ?? "").replace(/\s+/g, " ").trim();
        transcriptMethod = "scrape";
        wordCount = transcript.split(/\s+/).length;
        status = "ready";
        metadata = {
          siteName: article.siteName,
          excerpt: article.excerpt?.slice(0, 200),
        };
      }
    } catch (err) {
      return NextResponse.json(
        { error: `Article fetch failed: ${err instanceof Error ? err.message : "unknown"}` },
        { status: 500 }
      );
    }
  }

  // Insert
  const { data, error } = await supabase
    .from("listening_station_sources")
    .insert({
      url,
      source_type: sourceType,
      title,
      author,
      metadata,
      transcript,
      transcript_method: transcriptMethod,
      status,
      topic_tags: tags,
      word_count: wordCount,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: `Database error: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    id: data.id,
    title: data.title,
    status: data.status,
    sourceType,
    wordCount,
  });
}

function detectSourceType(url: string): string {
  const host = new URL(url).hostname.toLowerCase();
  if (
    host.includes("youtube.com") ||
    host.includes("youtu.be")
  ) {
    return "youtube";
  }
  if (
    host.includes("podcasts.apple.com") ||
    host.includes("open.spotify.com")
  ) {
    return "podcast";
  }
  return "article";
}

function parseVTT(vtt: string): string {
  const lines = vtt.split("\n");
  const textLines: string[] = [];
  let lastLine = "";

  for (const line of lines) {
    const trimmed = line.trim();
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
    const clean = trimmed
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .trim();
    if (clean && clean !== lastLine) {
      textLines.push(clean);
      lastLine = clean;
    }
  }
  return textLines.join(" ");
}
