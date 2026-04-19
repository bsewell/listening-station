#!/usr/bin/env tsx
/**
 * CLI: Publish an episode — commit to repo and trigger distribution
 *
 * Usage:
 *   npx tsx scripts/publish.ts <episode_id>
 *   npx tsx scripts/publish.ts <episode_id> --preview  # Show content without publishing
 */

import { supabase } from "../lib/supabase.js";
import { distribute, isN8nAvailable } from "../distribute/n8n.js";
import { generateEpisodePage, generateIndex } from "../distribute/github-pages.js";
import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const PROJECT_ROOT = join(import.meta.dirname, "..");
const CONTENT_DIR = join(PROJECT_ROOT, "content", "episodes");

async function main() {
  const args = process.argv.slice(2);
  const episodeId = args[0];
  const preview = args.includes("--preview");

  if (!episodeId) {
    console.error("Usage: npx tsx scripts/publish.ts <episode_id> [--preview]");
    process.exit(1);
  }

  // Load episode
  const { data: episode } = await supabase
    .from("listening_station_episodes")
    .select("*")
    .eq("id", episodeId)
    .single();

  if (!episode) {
    console.error("Episode not found:", episodeId);
    process.exit(1);
  }

  // Load cluster for source info
  const { data: cluster } = await supabase
    .from("listening_station_clusters")
    .select("*")
    .eq("id", episode.cluster_id)
    .single();

  // Load sources for citation
  const sources = cluster
    ? (
        await supabase
          .from("listening_station_sources")
          .select("url, title, author, source_type")
          .in("id", cluster.source_ids)
      ).data || []
    : [];

  if (preview) {
    console.log("=== EPISODE PREVIEW ===\n");
    console.log(`Title: ${episode.title}`);
    console.log(`Slug: ${episode.slug}`);
    console.log(`Episode #${episode.episode_number}`);
    console.log(`\n--- Interview ---`);
    console.log(episode.interview_md?.slice(0, 500) + "...");
    console.log(`\n--- Blog ---`);
    console.log(episode.blog_md?.slice(0, 500) + "...");
    console.log(`\n--- Social Clips ---`);
    console.log(JSON.stringify(episode.social_clips, null, 2));
    return;
  }

  // Create episode directory
  const episodeDir = join(CONTENT_DIR, episode.slug);
  if (!existsSync(episodeDir)) {
    await mkdir(episodeDir, { recursive: true });
  }

  // Write content files
  const filesToWrite: [string, string][] = [];

  if (episode.interview_md) {
    filesToWrite.push([join(episodeDir, "interview.md"), episode.interview_md]);
  }
  if (episode.blog_md) {
    filesToWrite.push([join(episodeDir, "blog.md"), episode.blog_md]);
  }
  if (episode.audio_script) {
    filesToWrite.push([
      join(episodeDir, "audio-script.md"),
      episode.audio_script,
    ]);
  }

  // Sources manifest
  filesToWrite.push([
    join(episodeDir, "sources.json"),
    JSON.stringify(sources, null, 2),
  ]);

  // Social clips
  if (episode.social_clips) {
    filesToWrite.push([
      join(episodeDir, "social.json"),
      JSON.stringify(episode.social_clips, null, 2),
    ]);
  }

  // Briefing if available
  if (cluster?.briefing) {
    filesToWrite.push([join(episodeDir, "briefing.md"), cluster.briefing]);
  }

  await Promise.all(filesToWrite.map(([path, content]) => writeFile(path, content)));

  console.log(`Written ${filesToWrite.length} files to ${episodeDir}`);

  // Git commit
  try {
    await exec("git", ["add", episodeDir], { cwd: PROJECT_ROOT });
    await exec(
      "git",
      [
        "commit",
        "-m",
        `publish: episode ${episode.episode_number} — ${episode.title}`,
      ],
      { cwd: PROJECT_ROOT }
    );
    console.log("Committed to git");
  } catch (err) {
    console.log("Git commit skipped (not a git repo or no changes)");
  }

  // Update episode status
  const now = new Date().toISOString();
  await supabase
    .from("listening_station_episodes")
    .update({
      status: "published",
      published_at: now,
      distribution: {
        github: { committed: true, path: episodeDir, at: now },
      },
    })
    .eq("id", episodeId);

  // Update cluster status
  if (cluster) {
    await supabase
      .from("listening_station_clusters")
      .update({ status: "published" })
      .eq("id", cluster.id);
  }

  console.log(`\nPublished! Episode ${episode.episode_number}: "${episode.title}"`);
  console.log(`  Content: ${episodeDir}`);

  // Generate GitHub Pages static HTML
  console.log("\nGenerating GitHub Pages...");
  const pagePath = await generateEpisodePage(episode.slug);
  if (pagePath) console.log(`  Episode page: ${pagePath}`);
  await generateIndex();
  console.log("  Index updated");

  // Git add the generated pages too
  try {
    const contentRoot = join(PROJECT_ROOT, "content");
    await exec("git", ["add", contentRoot], { cwd: PROJECT_ROOT });
    await exec(
      "git",
      ["commit", "-m", `pages: generate static HTML for episode ${episode.episode_number}`],
      { cwd: PROJECT_ROOT }
    );
    console.log("  Pages committed");
  } catch {
    // No changes or not a git repo
  }

  // Distribute via n8n webhooks
  const n8nUp = await isN8nAvailable();
  if (n8nUp) {
    console.log("\nDistributing via n8n...");
    const results = await distribute({
      episodeId,
      slug: episode.slug,
      title: episode.title,
      episodeNumber: episode.episode_number,
      blog: episode.blog_md,
      socialClips: episode.social_clips || [],
      audioScript: episode.audio_script,
      sources,
      publishedAt: now,
    });

    const distributionRecord: Record<string, unknown> = {
      github: { committed: true, path: episodeDir, at: now },
    };

    for (const r of results) {
      console.log(`  ${r.channel}: ${r.success ? "sent" : `failed — ${r.error}`}`);
      distributionRecord[r.channel] = {
        sent: r.success,
        at: now,
        ...(r.error && { error: r.error }),
      };
    }

    // Update distribution record with n8n results
    await supabase
      .from("listening_station_episodes")
      .update({ distribution: distributionRecord })
      .eq("id", episodeId);
  } else {
    console.log("\nn8n not running — skipping webhook distribution");
    console.log("Start n8n and re-run to distribute, or distribute manually");
  }
}

main().catch((err) => {
  console.error("Publish failed:", err.message);
  process.exit(1);
});
