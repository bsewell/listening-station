/**
 * Insight Extraction — extracts structured, actionable insights from source transcripts
 * Uses Ollama (qwen2.5-coder:32b) for local extraction
 */

import { generate } from "./ollama.js";
import type { SupabaseClient } from "@supabase/supabase-js";

const CHUNK_SIZE = 6000;
const CHUNK_OVERLAP = 500;
const JACCARD_THRESHOLD = 0.6;

export interface ExtractedInsight {
  topic: string;
  subtopic: string | null;
  insight: string;
  evidence: string | null;
  category: string;
  relevance: string | null;
  confidence: number;
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

function buildPrompt(
  title: string,
  author: string,
  chunk: string,
  categoryNames: string[]
): string {
  return `You are extracting actionable insights from a transcript for someone building GIStudio, a GI health tracking iOS app built with SwiftUI and Supabase.

For each insight, provide a JSON object with these fields:
- topic: A short label (2-5 words) for the subject area
- subtopic: A more specific label within that topic (2-5 words), or null
- insight: ONE concrete, actionable sentence. Not a vague summary — something specific enough to act on. Bad: "User research is important." Good: "Run 5 user interviews before building any new feature — the first 3 reveal obvious problems, interviews 4-5 reveal the non-obvious ones."
- evidence: A direct quote or close paraphrase from the transcript that supports this insight, or null if implicit
- category: Which product process does this belong to? Choose ONE from: ${JSON.stringify(categoryNames)}
- relevance: One sentence on why this matters specifically for building a health app, or null
- confidence: 0.0-1.0 how confident you are this insight is accurate and actionable

Extract 5-10 insights. Prefer fewer, high-quality insights over many weak ones.
Skip anything that is:
- Generic advice anyone already knows ("test your code", "listen to users")
- Specific to a domain completely unrelated to health tech or app building
- Opinion without evidence or reasoning

Source: "${title}" by ${author}

Transcript chunk:
${chunk}

Return ONLY a valid JSON array. No markdown fences, no extra text.`;
}

function chunkTranscript(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start = end - CHUNK_OVERLAP;
  }
  return chunks;
}

function wordSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  const intersection = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

function deduplicateInsights(
  insights: ExtractedInsight[]
): ExtractedInsight[] {
  const result: ExtractedInsight[] = [];
  const wordSets: Set<string>[] = [];

  for (const insight of insights) {
    const ws = wordSet(insight.insight);
    const isDuplicate = wordSets.some((existing) =>
      jaccard(ws, existing) > JACCARD_THRESHOLD
    );
    if (!isDuplicate) {
      result.push(insight);
      wordSets.push(ws);
    }
  }

  return result;
}

export async function extractInsights(
  supabase: SupabaseClient,
  source: {
    id: string;
    title: string;
    author: string;
    transcript: string;
  },
  options?: { reprocess?: boolean }
): Promise<ExtractedInsight[]> {
  // Check for existing extraction
  if (!options?.reprocess) {
    const { data: existing } = await supabase
      .from("listening_station_extractions")
      .select("id, insight_count")
      .eq("source_id", source.id)
      .single();

    if (existing) {
      console.log(
        `  Already extracted (${existing.insight_count} insights). Use --reprocess to re-extract.`
      );
      return [];
    }
  } else {
    // Delete existing extraction and insights
    await supabase
      .from("listening_station_insights")
      .delete()
      .eq("source_id", source.id);
    await supabase
      .from("listening_station_extractions")
      .delete()
      .eq("source_id", source.id);
  }

  // Load categories
  const { data: categories } = await supabase
    .from("listening_station_categories")
    .select("id, name, slug")
    .order("sort_order");

  if (!categories?.length) {
    throw new Error("No categories found — run the migration first");
  }

  const categoryNames = categories.map((c: Category) => c.name);
  const categoryMap = new Map(
    categories.map((c: Category) => [c.name.toLowerCase(), c.id])
  );

  const chunks = chunkTranscript(source.transcript);
  console.log(
    `  Extracting from ${chunks.length} chunk(s) (${source.transcript.length} chars)...`
  );

  const startTime = Date.now();
  const allInsights: ExtractedInsight[] = [];

  for (let i = 0; i < chunks.length; i++) {
    console.log(`  Chunk ${i + 1}/${chunks.length}...`);

    const prompt = buildPrompt(
      source.title,
      source.author,
      chunks[i],
      categoryNames
    );

    try {
      const response = await generate(prompt, { temperature: 0.3 });
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.log(`    No JSON array found in response, skipping chunk`);
        continue;
      }

      const parsed: ExtractedInsight[] = JSON.parse(jsonMatch[0]);
      allInsights.push(...parsed);
      console.log(`    Found ${parsed.length} insights`);
    } catch (err) {
      console.log(
        `    Error parsing chunk ${i + 1}: ${err instanceof Error ? err.message : "unknown"}`
      );
    }
  }

  // Deduplicate
  const deduplicated = deduplicateInsights(allInsights);
  console.log(
    `  Deduplicated: ${allInsights.length} → ${deduplicated.length} insights`
  );

  // Insert insights
  const insightRows = deduplicated.map((insight) => ({
    source_id: source.id,
    category_id:
      categoryMap.get(insight.category?.toLowerCase()) || null,
    topic: insight.topic || "Uncategorized",
    subtopic: insight.subtopic || null,
    insight: insight.insight,
    evidence: insight.evidence || null,
    relevance: insight.relevance || null,
    confidence: Math.max(0, Math.min(1, insight.confidence ?? 0.5)),
    status: "pending",
  }));

  if (insightRows.length > 0) {
    const { error } = await supabase
      .from("listening_station_insights")
      .insert(insightRows);

    if (error) {
      console.error(`  Failed to insert insights: ${error.message}`);
    }
  }

  const durationMs = Date.now() - startTime;

  // Record extraction
  await supabase.from("listening_station_extractions").insert({
    source_id: source.id,
    insight_count: deduplicated.length,
    model: process.env.OLLAMA_MODEL || "qwen2.5-coder:32b",
    duration_ms: durationMs,
  });

  return deduplicated;
}
