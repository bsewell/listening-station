import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5-coder:32b";

export async function GET(
  _request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params;
  const supabase = createServerClient();

  const { data: source } = await supabase
    .from("listening_station_sources")
    .select("*")
    .eq("id", id)
    .single();

  if (!source) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  if (!source.transcript) {
    return NextResponse.json(
      { error: "No transcript available" },
      { status: 400 }
    );
  }

  // Extract repos and links from description and transcript
  const description = (source.metadata?.description as string) || "";
  const allText = `${description}\n${source.transcript}`;

  const repos = extractGitHubRepos(allText);
  const links = extractUsefulLinks(description);

  // Generate summary via Ollama
  const transcript = source.transcript.slice(0, 8000);

  const prompt = `Analyze this transcript and provide a JSON response with exactly this structure:
{
  "keyTakeaways": ["takeaway 1", "takeaway 2", ...],
  "whyItMatters": "one paragraph about relevance to building a health app with AI"
}

Rules:
- keyTakeaways: 4-6 bullet points of the most important things someone building a health tech app could learn from this content. Be specific and actionable, not generic.
- whyItMatters: 2-3 sentences connecting the content to building GIStudio (a GI health tracking iOS app built with SwiftUI and Supabase). Focus on practical implications.
- Return ONLY valid JSON, no markdown fences, no extra text.

Title: "${source.title}"
Author: ${source.author}

Transcript:
${transcript}`;

  try {
    const ollamaRes = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        options: { temperature: 0.3, num_ctx: 16384 },
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!ollamaRes.ok) {
      // Fallback: return just the extracted links/repos without AI summary
      return NextResponse.json({
        keyTakeaways: generateFallbackTakeaways(source),
        whyItMatters:
          "This source has been ingested but AI summary is unavailable. Review the transcript directly.",
        repos,
        links,
      });
    }

    const ollamaData = await ollamaRes.json();
    const responseText = ollamaData.response || "";

    // Parse JSON from Ollama response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({
        keyTakeaways: generateFallbackTakeaways(source),
        whyItMatters: "Summary generation returned unexpected format.",
        repos,
        links,
      });
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return NextResponse.json({
      keyTakeaways: parsed.keyTakeaways || [],
      whyItMatters: parsed.whyItMatters || "",
      repos,
      links,
    });
  } catch {
    // Ollama not available — return extracted data only
    return NextResponse.json({
      keyTakeaways: generateFallbackTakeaways(source),
      whyItMatters:
        "AI summary unavailable (Ollama not running). Key data extracted from metadata.",
      repos,
      links,
    });
  }
}

function extractGitHubRepos(text: string): { url: string; name: string }[] {
  const repoPattern = /https?:\/\/github\.com\/([a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+)/g;
  const seen = new Set<string>();
  const repos: { url: string; name: string }[] = [];

  let match;
  while ((match = repoPattern.exec(text)) !== null) {
    const name = match[1];
    // Filter out common non-repo paths
    if (
      name.includes("/issues") ||
      name.includes("/pull") ||
      name.includes("/blob") ||
      name.includes("/tree") ||
      name.includes("/commit")
    ) {
      continue;
    }
    if (!seen.has(name)) {
      seen.add(name);
      repos.push({
        url: `https://github.com/${name}`,
        name,
      });
    }
  }

  return repos;
}

function extractUsefulLinks(
  description: string
): { url: string; label: string }[] {
  const urlPattern = /https?:\/\/[^\s<>"]+/g;
  const links: { url: string; label: string }[] = [];
  const seen = new Set<string>();

  let match;
  while ((match = urlPattern.exec(description)) !== null) {
    let url = match[0].replace(/[.,;:!?)]+$/, ""); // strip trailing punctuation
    const host = new URL(url).hostname;

    // Skip social/subscribe links
    if (
      host.includes("youtube.com") ||
      host.includes("youtu.be") ||
      host.includes("twitter.com") ||
      host.includes("x.com") ||
      host.includes("instagram.com") ||
      host.includes("tiktok.com") ||
      host.includes("facebook.com")
    ) {
      continue;
    }

    if (!seen.has(url)) {
      seen.add(url);
      // Generate a readable label
      const label =
        host.replace("www.", "").split(".")[0] +
        (new URL(url).pathname.length > 1
          ? new URL(url).pathname.slice(0, 30)
          : "");
      links.push({ url, label });
    }
  }

  return links.slice(0, 8); // Cap at 8 links
}

function generateFallbackTakeaways(source: {
  title: string | null;
  word_count: number | null;
  source_type: string;
  duration_seconds: number | null;
}): string[] {
  const takeaways: string[] = [];
  if (source.title) {
    takeaways.push(`Topic: ${source.title}`);
  }
  if (source.word_count) {
    takeaways.push(
      `${source.word_count.toLocaleString()}-word ${source.source_type} transcript available for review`
    );
  }
  if (source.duration_seconds) {
    const mins = Math.round(source.duration_seconds / 60);
    takeaways.push(`${mins}-minute ${source.source_type}`);
  }
  takeaways.push("Click 'View original' to watch/read the source directly");
  return takeaways;
}
