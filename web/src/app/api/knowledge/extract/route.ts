import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5-coder:32b";

export async function POST(request: Request) {
  const supabase = createServerClient();

  let body: { sourceId: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { sourceId } = body;
  if (!sourceId) {
    return NextResponse.json(
      { error: "sourceId is required" },
      { status: 400 }
    );
  }

  // Check if already extracted
  const { data: existing } = await supabase
    .from("listening_station_extractions")
    .select("id, insight_count")
    .eq("source_id", sourceId)
    .single();

  if (existing) {
    return NextResponse.json({
      sourceId,
      insightCount: existing.insight_count,
      skipped: true,
    });
  }

  // Load source
  const { data: source } = await supabase
    .from("listening_station_sources")
    .select("id, title, author, transcript")
    .eq("id", sourceId)
    .single();

  if (!source?.transcript) {
    return NextResponse.json(
      { error: "Source not found or has no transcript" },
      { status: 404 }
    );
  }

  // Load categories
  const { data: categories } = await supabase
    .from("listening_station_categories")
    .select("id, name, slug")
    .order("sort_order");

  const categoryNames = (categories || []).map(
    (c: { name: string }) => c.name
  );
  const categoryMap = new Map(
    (categories || []).map((c: { name: string; id: string }) => [
      c.name.toLowerCase(),
      c.id,
    ])
  );

  // Chunk and extract
  const CHUNK_SIZE = 6000;
  const CHUNK_OVERLAP = 500;
  const chunks: string[] = [];
  let start = 0;
  while (start < source.transcript.length) {
    const end = Math.min(start + CHUNK_SIZE, source.transcript.length);
    chunks.push(source.transcript.slice(start, end));
    if (end >= source.transcript.length) break;
    start = end - CHUNK_OVERLAP;
  }

  const startTime = Date.now();
  const allInsights: {
    topic: string;
    subtopic?: string;
    insight: string;
    evidence?: string;
    category?: string;
    relevance?: string;
    confidence?: number;
  }[] = [];

  for (const chunk of chunks) {
    const prompt = `You are extracting actionable insights from a transcript for someone building GIStudio, a GI health tracking iOS app built with SwiftUI and Supabase.

For each insight, provide a JSON object with these fields:
- topic: A short label (2-5 words) for the subject area
- subtopic: A more specific label within that topic (2-5 words), or null
- insight: ONE concrete, actionable sentence. Not a vague summary — something specific enough to act on.
- evidence: A direct quote or close paraphrase from the transcript, or null
- category: Choose ONE from: ${JSON.stringify(categoryNames)}
- relevance: One sentence on why this matters for building a health app, or null
- confidence: 0.0-1.0 how confident you are this insight is accurate and actionable

Extract 5-10 insights. Prefer fewer, high-quality insights over many weak ones.
Skip generic advice, unrelated domains, and unsupported opinions.

Source: "${source.title}" by ${source.author}

Transcript chunk:
${chunk}

Return ONLY a valid JSON array. No markdown fences, no extra text.`;

    try {
      const res = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          prompt,
          stream: false,
          options: { temperature: 0.3, num_ctx: 16384 },
        }),
        signal: AbortSignal.timeout(300000),
      });

      if (!res.ok) continue;

      const data = await res.json();
      const jsonMatch = (data.response || "").match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        allInsights.push(...JSON.parse(jsonMatch[0]));
      }
    } catch {
      // Skip failed chunks
    }
  }

  // Simple dedup by word overlap
  const deduped = deduplicateInsights(allInsights);

  // Insert
  const rows = deduped.map((i) => ({
    source_id: sourceId,
    category_id: categoryMap.get(i.category?.toLowerCase() || "") || null,
    topic: i.topic || "Uncategorized",
    subtopic: i.subtopic || null,
    insight: i.insight,
    evidence: i.evidence || null,
    relevance: i.relevance || null,
    confidence: Math.max(0, Math.min(1, i.confidence ?? 0.5)),
    status: "pending",
  }));

  if (rows.length > 0) {
    await supabase.from("listening_station_insights").insert(rows);
  }

  await supabase.from("listening_station_extractions").insert({
    source_id: sourceId,
    insight_count: rows.length,
    model: OLLAMA_MODEL,
    duration_ms: Date.now() - startTime,
  });

  return NextResponse.json({
    sourceId,
    insightCount: rows.length,
    skipped: false,
  });
}

function deduplicateInsights<
  T extends { insight: string }
>(insights: T[]): T[] {
  const result: T[] = [];
  const wordSets: Set<string>[] = [];

  for (const item of insights) {
    const words = new Set(
      item.insight
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 2)
    );

    const isDup = wordSets.some((existing) => {
      const intersection = [...words].filter((w) => existing.has(w)).length;
      const union = new Set([...words, ...existing]).size;
      return union > 0 && intersection / union > 0.6;
    });

    if (!isDup) {
      result.push(item);
      wordSets.push(words);
    }
  }

  return result;
}
