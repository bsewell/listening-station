#!/usr/bin/env tsx
/**
 * CLI: Ingest a URL into the Listening Station
 *
 * Usage:
 *   npx tsx scripts/ingest.ts <url> [--tag topic1,topic2]
 *
 * Examples:
 *   npx tsx scripts/ingest.ts https://youtube.com/watch?v=abc123
 *   npx tsx scripts/ingest.ts https://youtube.com/watch?v=abc123 --tag claude,computer-use
 *   npx tsx scripts/ingest.ts https://example.com/article --tag ai-health
 */

import { createClient } from "@supabase/supabase-js";
import { detectSourceType } from "../ingest/transcript-finder.js";
import { ingestYouTube } from "../ingest/youtube.js";
import { ingestArticle } from "../ingest/article.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables"
  );
  console.error("Set them in .env or export them before running");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const args = process.argv.slice(2);
  const url = args[0];

  if (!url) {
    console.error("Usage: npx tsx scripts/ingest.ts <url> [--tag topic1,topic2]");
    process.exit(1);
  }

  // Parse tags
  const tagIndex = args.indexOf("--tag");
  const tags =
    tagIndex !== -1 && args[tagIndex + 1]
      ? args[tagIndex + 1].split(",").map((t) => t.trim())
      : [];

  const sourceType = detectSourceType(url);
  console.log(`Detected source type: ${sourceType}`);
  console.log(`URL: ${url}`);
  if (tags.length) console.log(`Tags: ${tags.join(", ")}`);

  // Check if already ingested
  const { data: existing } = await supabase
    .from("listening_station_sources")
    .select("id, status")
    .eq("url", url)
    .single();

  if (existing) {
    console.log(`Already ingested (id: ${existing.id}, status: ${existing.status})`);
    return;
  }

  let title: string | undefined;
  let author: string | undefined;
  let publishedAt: string | undefined;
  let transcript: string | null = null;
  let transcriptMethod: string | null = null;
  let metadata: Record<string, unknown> = {};
  let duration: number | undefined;
  let wordCount: number | undefined;
  let status = "pending";

  if (sourceType === "youtube") {
    console.log("Fetching YouTube metadata...");
    const result = await ingestYouTube(url);
    title = result.metadata.title;
    author = result.metadata.author;
    publishedAt = result.metadata.publishedAt;
    duration = result.metadata.duration;
    metadata = {
      videoId: result.metadata.id,
      description: result.metadata.description,
      thumbnailUrl: result.metadata.thumbnailUrl,
    };

    if (result.transcript) {
      transcript = result.transcript;
      transcriptMethod = result.transcriptMethod;
      wordCount = transcript.split(/\s+/).length;
      status = "ready";
      console.log(
        `Found existing captions (${wordCount} words)`
      );
    } else if (result.audioPath) {
      console.log(`Audio downloaded to ${result.audioPath}`);
      console.log(
        "Run Meeting Transcriber MCP to transcribe, then update the source record"
      );
      status = "transcribing";
      metadata = { ...metadata, audioPath: result.audioPath };
    }
  } else if (sourceType === "article") {
    console.log("Fetching article...");
    const result = await ingestArticle(url);
    title = result.metadata.title;
    author = result.metadata.author;
    publishedAt = result.metadata.publishedAt;
    transcript = result.content;
    transcriptMethod = "scrape";
    wordCount = result.wordCount;
    status = "ready";
    metadata = {
      siteName: result.metadata.siteName,
      excerpt: result.metadata.excerpt,
    };
    console.log(`Extracted article (${wordCount} words)`);
  } else if (sourceType === "podcast") {
    console.log(
      "Podcast ingestion requires an RSS feed URL. Use the podcast module directly."
    );
    status = "pending";
  }

  // Insert into Supabase
  const { data, error } = await supabase
    .from("listening_station_sources")
    .insert({
      url,
      source_type: sourceType,
      title,
      author,
      published_at: publishedAt,
      metadata,
      transcript,
      transcript_method: transcriptMethod,
      status,
      topic_tags: tags,
      duration_seconds: duration,
      word_count: wordCount,
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to insert:", error.message);
    process.exit(1);
  }

  console.log(`\nIngested successfully!`);
  console.log(`  ID: ${data.id}`);
  console.log(`  Title: ${title}`);
  console.log(`  Status: ${status}`);

  if (status === "ready") {
    console.log("\nNext: Add to a topic cluster with:");
    console.log(`  npx tsx scripts/cluster.ts --add ${data.id} --topic <topic>`);
  }
}

main().catch((err) => {
  console.error("Ingest failed:", err.message);
  process.exit(1);
});
