#!/usr/bin/env tsx
/**
 * CLI: Cluster sources by topic and generate briefings
 *
 * Usage:
 *   npx tsx scripts/cluster.ts --topic <topic>                    # Create cluster from tagged sources
 *   npx tsx scripts/cluster.ts --add <source_id> --topic <topic>  # Add source to topic
 *   npx tsx scripts/cluster.ts --brief <cluster_id>               # Generate briefing for cluster
 *   npx tsx scripts/cluster.ts --list                             # List all clusters
 */

import { createClient } from "@supabase/supabase-js";
import { generateBriefing as generateBriefingDoc } from "../analyze/briefing.js";
import { generateQuestions } from "../analyze/questions.js";
import { indexInLightRAG } from "../analyze/cluster.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function listClusters() {
  const { data, error } = await supabase
    .from("listening_station_clusters")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error:", error.message);
    return;
  }

  if (!data?.length) {
    console.log("No clusters yet. Create one with --topic <topic>");
    return;
  }

  console.log("\nClusters:");
  for (const cluster of data) {
    console.log(
      `  [${cluster.status}] ${cluster.topic} (${cluster.source_ids?.length || 0} sources) — ${cluster.id}`
    );
  }
}

async function addToTopic(sourceId: string, topic: string) {
  // Check source exists and is ready
  const { data: source, error: sourceErr } = await supabase
    .from("listening_station_sources")
    .select("id, title, status, topic_tags")
    .eq("id", sourceId)
    .single();

  if (sourceErr || !source) {
    console.error("Source not found:", sourceId);
    return;
  }

  // Update source tags
  const existingTags: string[] = source.topic_tags || [];
  if (!existingTags.includes(topic)) {
    await supabase
      .from("listening_station_sources")
      .update({ topic_tags: [...existingTags, topic] })
      .eq("id", sourceId);
  }

  // Find or create cluster
  const { data: existing } = await supabase
    .from("listening_station_clusters")
    .select("*")
    .eq("topic", topic)
    .single();

  if (existing) {
    const sourceIds: string[] = existing.source_ids || [];
    if (!sourceIds.includes(sourceId)) {
      sourceIds.push(sourceId);
      await supabase
        .from("listening_station_clusters")
        .update({ source_ids: sourceIds })
        .eq("id", existing.id);
    }
    console.log(
      `Added "${source.title}" to cluster "${topic}" (${sourceIds.length} sources)`
    );
  } else {
    const { data: newCluster } = await supabase
      .from("listening_station_clusters")
      .insert({
        topic,
        description: `Sources related to ${topic}`,
        source_ids: [sourceId],
      })
      .select()
      .single();

    console.log(`Created cluster "${topic}" with source "${source.title}"`);
    console.log(`  Cluster ID: ${newCluster?.id}`);
  }
}

async function createClusterFromTags(topic: string) {
  // Find all sources tagged with this topic
  const { data: sources } = await supabase
    .from("listening_station_sources")
    .select("id, title, status")
    .contains("topic_tags", [topic]);

  if (!sources?.length) {
    console.log(`No sources tagged with "${topic}". Ingest some first.`);
    return;
  }

  const readySources = sources.filter((s) => s.status === "ready");
  console.log(
    `Found ${sources.length} sources tagged "${topic}" (${readySources.length} ready)`
  );

  const sourceIds = sources.map((s) => s.id);

  const { data: cluster, error } = await supabase
    .from("listening_station_clusters")
    .insert({
      topic,
      description: `Sources related to ${topic}`,
      source_ids: sourceIds,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating cluster:", error.message);
    return;
  }

  console.log(`\nCreated cluster "${topic}"`);
  console.log(`  ID: ${cluster.id}`);
  console.log(`  Sources:`);
  for (const s of sources) {
    console.log(`    [${s.status}] ${s.title}`);
  }

  if (readySources.length >= 2) {
    console.log(`\nReady for briefing! Run:`);
    console.log(`  npx tsx scripts/cluster.ts --brief ${cluster.id}`);
  }
}

async function generateBriefing(clusterId: string) {
  const { data: cluster } = await supabase
    .from("listening_station_clusters")
    .select("*")
    .eq("id", clusterId)
    .single();

  if (!cluster) {
    console.error("Cluster not found:", clusterId);
    return;
  }

  // Fetch all source transcripts
  const { data: sources } = await supabase
    .from("listening_station_sources")
    .select("*")
    .in("id", cluster.source_ids)
    .eq("status", "ready");

  if (!sources?.length) {
    console.error("No ready sources in this cluster");
    return;
  }

  // Map sources to the briefing generator format
  const sourceSummaries = sources.map((s) => ({
    id: s.id,
    title: s.title || "Untitled",
    author: s.author || "Unknown",
    url: s.url,
    transcript: s.transcript || "",
    sourceType: s.source_type,
  }));

  // Generate briefing via Ollama
  const briefing = await generateBriefingDoc(cluster.topic, sourceSummaries);

  // Generate additional interview questions
  console.log("\nGenerating interview questions...");
  const questions = await generateQuestions(
    cluster.topic,
    briefing.markdown,
    sources.length
  );

  // Merge questions (deduplicate)
  const allQuestions = [...new Set([...briefing.questions, ...questions])];

  // Save briefing and questions to cluster
  await supabase
    .from("listening_station_clusters")
    .update({
      briefing: briefing.markdown,
      interview_questions: allQuestions,
      status: "briefed",
    })
    .eq("id", clusterId);

  console.log(`\nBriefing generated!`);
  console.log(`  Topic: ${cluster.topic}`);
  console.log(`  Sources synthesized: ${briefing.sourceCount}`);
  console.log(`  Interview questions: ${allQuestions.length}`);
  console.log(`\nReady for interview generation:`);
  console.log(`  npx tsx scripts/interview.ts ${clusterId}`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--list")) {
    await listClusters();
    return;
  }

  const topicIndex = args.indexOf("--topic");
  const topic =
    topicIndex !== -1 ? args[topicIndex + 1] : undefined;

  const addIndex = args.indexOf("--add");
  const addSourceId = addIndex !== -1 ? args[addIndex + 1] : undefined;

  const briefIndex = args.indexOf("--brief");
  const briefClusterId =
    briefIndex !== -1 ? args[briefIndex + 1] : undefined;

  if (briefClusterId) {
    await generateBriefing(briefClusterId);
  } else if (addSourceId && topic) {
    await addToTopic(addSourceId, topic);
  } else if (topic) {
    await createClusterFromTags(topic);
  } else {
    console.error("Usage:");
    console.error(
      "  npx tsx scripts/cluster.ts --topic <topic>                    # Create cluster"
    );
    console.error(
      "  npx tsx scripts/cluster.ts --add <source_id> --topic <topic>  # Add source"
    );
    console.error(
      "  npx tsx scripts/cluster.ts --brief <cluster_id>               # Generate briefing"
    );
    console.error(
      "  npx tsx scripts/cluster.ts --list                             # List clusters"
    );
  }
}

main().catch((err) => {
  console.error("Cluster operation failed:", err.message);
  process.exit(1);
});
