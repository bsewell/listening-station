#!/usr/bin/env tsx
/**
 * CLI: Extract actionable insights from source transcripts
 *
 * Usage:
 *   npx tsx scripts/extract-insights.ts              # All unextracted ready sources
 *   npx tsx scripts/extract-insights.ts <source_id>  # One specific source
 *   npx tsx scripts/extract-insights.ts --reprocess <source_id>  # Delete & re-extract
 */

import { supabase } from "../lib/supabase.js";
import { extractInsights } from "../analyze/extract-insights.js";
import { isAvailable } from "../analyze/ollama.js";

async function main() {
  const args = process.argv.slice(2);
  const reprocess = args.includes("--reprocess");
  const sourceId = args.find((a) => !a.startsWith("--"));

  // Check Ollama
  const ollamaUp = await isAvailable();
  if (!ollamaUp) {
    console.error("Ollama is not running. Start it first.");
    process.exit(1);
  }

  if (sourceId) {
    // Single source
    const { data: source } = await supabase
      .from("listening_station_sources")
      .select("id, title, author, transcript, status")
      .eq("id", sourceId)
      .single();

    if (!source) {
      console.error("Source not found:", sourceId);
      process.exit(1);
    }

    if (!source.transcript) {
      console.error("Source has no transcript");
      process.exit(1);
    }

    console.log(`Extracting insights from: "${source.title}"`);
    const insights = await extractInsights(supabase, {
      id: source.id,
      title: source.title || "Untitled",
      author: source.author || "Unknown",
      transcript: source.transcript,
    }, { reprocess });

    if (insights.length > 0) {
      console.log(`\nExtracted ${insights.length} insights:`);
      for (const i of insights) {
        console.log(`  [${i.category}] ${i.topic}: ${i.insight.slice(0, 80)}...`);
      }
    }
    return;
  }

  // Batch: all unextracted ready sources
  const { data: sources } = await supabase
    .from("listening_station_sources")
    .select("id, title, author, transcript")
    .eq("status", "ready")
    .not("transcript", "is", null);

  if (!sources?.length) {
    console.log("No ready sources found.");
    return;
  }

  // Find which ones already have extractions
  const { data: extractions } = await supabase
    .from("listening_station_extractions")
    .select("source_id");

  const extractedIds = new Set(
    (extractions || []).map((e: { source_id: string }) => e.source_id)
  );
  const unextracted = sources.filter((s) => !extractedIds.has(s.id));

  if (!unextracted.length) {
    console.log(
      `All ${sources.length} sources already extracted. Use --reprocess <id> to re-extract.`
    );
    return;
  }

  console.log(
    `Found ${unextracted.length} unextracted source(s) (of ${sources.length} total)\n`
  );

  let totalInsights = 0;

  for (let i = 0; i < unextracted.length; i++) {
    const source = unextracted[i];
    console.log(
      `[${i + 1}/${unextracted.length}] "${source.title}"`
    );

    const insights = await extractInsights(supabase, {
      id: source.id,
      title: source.title || "Untitled",
      author: source.author || "Unknown",
      transcript: source.transcript,
    });

    totalInsights += insights.length;
    console.log("");
  }

  console.log(`\nDone! Extracted ${totalInsights} total insights from ${unextracted.length} sources.`);
  console.log("Review them at http://localhost:3000/knowledge");
}

main().catch((err) => {
  console.error("Extraction failed:", err.message);
  process.exit(1);
});
