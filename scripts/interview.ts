#!/usr/bin/env tsx
/**
 * CLI: Generate an interview from a topic cluster
 *
 * Usage:
 *   npx tsx scripts/interview.ts <cluster_id>
 *   npx tsx scripts/interview.ts <cluster_id> --dry-run  # Preview without saving
 */

import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

if (!ANTHROPIC_API_KEY) {
  console.error("Missing ANTHROPIC_API_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const anthropic = new Anthropic();

const PROJECT_ROOT = join(import.meta.dirname, "..");

async function loadStyleGuide(): Promise<string> {
  return readFile(
    join(PROJECT_ROOT, "interviewer-lab", "style-guide.md"),
    "utf-8"
  );
}

async function loadPersona(): Promise<string> {
  const persona = await readFile(
    join(PROJECT_ROOT, "operator", "persona.md"),
    "utf-8"
  );
  const voice = await readFile(
    join(PROJECT_ROOT, "operator", "voice-rules.md"),
    "utf-8"
  );
  return `${persona}\n\n---\n\n${voice}`;
}

async function main() {
  const args = process.argv.slice(2);
  const clusterId = args[0];
  const dryRun = args.includes("--dry-run");

  if (!clusterId) {
    console.error("Usage: npx tsx scripts/interview.ts <cluster_id> [--dry-run]");
    process.exit(1);
  }

  // Load cluster
  const { data: cluster } = await supabase
    .from("listening_station_clusters")
    .select("*")
    .eq("id", clusterId)
    .single();

  if (!cluster) {
    console.error("Cluster not found:", clusterId);
    process.exit(1);
  }

  // Load sources
  const { data: sources } = await supabase
    .from("listening_station_sources")
    .select("*")
    .in("id", cluster.source_ids)
    .eq("status", "ready");

  if (!sources?.length) {
    console.error("No ready sources in this cluster");
    process.exit(1);
  }

  console.log(`Generating interview for topic: "${cluster.topic}"`);
  console.log(`Sources: ${sources.length}`);

  // Load style materials
  const [styleGuide, persona] = await Promise.all([
    loadStyleGuide(),
    loadPersona(),
  ]);

  // Build source context
  const sourceContext = sources
    .map(
      (s, i) =>
        `### Source ${i + 1}: "${s.title}" by ${s.author}
URL: ${s.url}
${s.transcript?.slice(0, 4000) || "[no transcript available]"}`
    )
    .join("\n\n");

  // Build the briefing context
  const briefingContext = cluster.briefing
    ? `## Existing Briefing\n${cluster.briefing}`
    : "No briefing generated yet — synthesize from source transcripts directly.";

  const systemPrompt = `You are the GIStudio Operator — a curious builder documenting the journey of creating a health technology app with AI tools. You conduct interview-style content pieces about topics you're actively learning.

${persona}

---

${styleGuide}`;

  const userPrompt = `Generate a complete interview-style content piece about the topic: "${cluster.topic}"

${briefingContext}

## Source Material
${sourceContext}

## Output Requirements

Generate FOUR sections, clearly separated:

### 1. INTERVIEW (interview.md)
A full interview transcript where the Operator explores this topic. Follow the style guide architecture:
- Open with a Maddow-style contextual analogy
- Build through Terry Gross chapter ordering
- Alternate between Ira Glass anecdote and reflection
- Maintain Radiolab co-discovery tone throughout
- Land with Planet Money concrete-to-principle synthesis
- Cite sources naturally ("As [author] explains in their [video/article]...")
- Connect insights to the GIStudio journey

### 2. BLOG POST (blog.md)
A polished blog post version (~800-1200 words):
- Compelling title
- Hook opening
- Clear sections with headers
- Source citations
- Forward-looking conclusion

### 3. SOCIAL CLIPS (social.json)
3-5 standalone social media snippets as a JSON array:
[{"platform": "twitter", "text": "...", "source": "..."}, ...]
- Each under 280 characters for Twitter
- Lead with the insight, not context
- Include attribution

### 4. AUDIO SCRIPT (audio-script.md)
TTS-ready version with delivery annotations:
- [pause], [beat], [emphasis] markers
- [music: tension], [music: resolve] cues
- Conversational pacing
- Include Radiolab "pointing arrows"

Separate each section with: ---SECTION: [name]---`;

  console.log("\nCalling Claude API...");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8000,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const content =
    response.content[0].type === "text" ? response.content[0].text : "";

  if (dryRun) {
    console.log("\n--- DRY RUN OUTPUT ---\n");
    console.log(content);
    return;
  }

  // Parse sections
  const sections = parseSections(content);

  // Generate slug
  const slug = `${new Date().toISOString().slice(0, 10)}-${cluster.topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 40)}`;

  // Parse social clips
  let socialClips: unknown[] = [];
  try {
    const jsonMatch = sections.social?.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      socialClips = JSON.parse(jsonMatch[0]);
    }
  } catch {
    socialClips = [{ text: sections.social || "", platform: "twitter" }];
  }

  // Count episodes for numbering
  const { count } = await supabase
    .from("listening_station_episodes")
    .select("*", { count: "exact", head: true });

  // Save episode
  const { data: episode, error } = await supabase
    .from("listening_station_episodes")
    .insert({
      cluster_id: clusterId,
      slug,
      title: `${cluster.topic}`,
      episode_number: (count || 0) + 1,
      interview_md: sections.interview || content,
      blog_md: sections.blog || null,
      social_clips: socialClips,
      audio_script: sections.audio || null,
      status: "draft",
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to save episode:", error.message);
    process.exit(1);
  }

  // Update cluster status
  await supabase
    .from("listening_station_clusters")
    .update({ status: "interviewed" })
    .eq("id", clusterId);

  console.log(`\nEpisode created!`);
  console.log(`  ID: ${episode.id}`);
  console.log(`  Slug: ${slug}`);
  console.log(`  Status: draft`);
  console.log(`\nReview and publish with:`);
  console.log(`  npx tsx scripts/publish.ts ${episode.id}`);
}

function parseSections(content: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const sectionPattern = /---SECTION:\s*(\w[\w\s.-]*?)---/gi;

  const parts = content.split(sectionPattern);

  for (let i = 1; i < parts.length; i += 2) {
    const name = parts[i].trim().toLowerCase().replace(/\s+/g, "-");
    const body = parts[i + 1]?.trim() || "";

    if (name.includes("interview")) sections.interview = body;
    else if (name.includes("blog")) sections.blog = body;
    else if (name.includes("social")) sections.social = body;
    else if (name.includes("audio")) sections.audio = body;
  }

  return sections;
}

main().catch((err) => {
  console.error("Interview generation failed:", err.message);
  process.exit(1);
});
