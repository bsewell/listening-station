/**
 * Topic Clustering — groups sources by topic and enriches with semantic connections
 * Supports manual tags + optional LightRAG auto-enrichment
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

const LIGHTRAG_URL = process.env.LIGHTRAG_URL || "http://localhost:9621";

export interface ClusterResult {
  clusterId: string;
  topic: string;
  sourceIds: string[];
  sourceCount: number;
}

/**
 * Create or update a topic cluster from tagged sources
 */
export async function createCluster(
  supabase: SupabaseClient,
  topic: string,
  sourceIds?: string[]
): Promise<ClusterResult> {
  // If no specific IDs, find all sources tagged with this topic
  if (!sourceIds) {
    const { data: tagged } = await supabase
      .from("listening_station_sources")
      .select("id")
      .contains("topic_tags", [topic]);

    sourceIds = tagged?.map((s) => s.id) || [];
  }

  if (!sourceIds.length) {
    throw new Error(`No sources found for topic "${topic}"`);
  }

  // Check for existing cluster
  const { data: existing } = await supabase
    .from("listening_station_clusters")
    .select("*")
    .eq("topic", topic)
    .single();

  if (existing) {
    // Merge source IDs
    const merged = [
      ...new Set([...(existing.source_ids || []), ...sourceIds]),
    ];
    await supabase
      .from("listening_station_clusters")
      .update({ source_ids: merged })
      .eq("id", existing.id);

    return {
      clusterId: existing.id,
      topic,
      sourceIds: merged,
      sourceCount: merged.length,
    };
  }

  // Create new cluster
  const { data: cluster, error } = await supabase
    .from("listening_station_clusters")
    .insert({
      topic,
      description: `Sources related to ${topic}`,
      source_ids: sourceIds,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create cluster: ${error.message}`);

  return {
    clusterId: cluster.id,
    topic,
    sourceIds,
    sourceCount: sourceIds.length,
  };
}

/**
 * Try to enrich a cluster using LightRAG semantic search
 * Returns additional related source IDs found through semantic similarity
 */
export async function enrichWithLightRAG(
  supabase: SupabaseClient,
  topic: string,
  existingSourceIds: string[]
): Promise<string[]> {
  try {
    const response = await fetch(`${LIGHTRAG_URL}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: topic,
        mode: "hybrid",
        top_k: 10,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.log("LightRAG not available — skipping semantic enrichment");
      return [];
    }

    const data = await response.json();
    const relatedDocIds: string[] = data.results
      ?.map((r: { doc_id?: string }) => r.doc_id)
      .filter((id: string | undefined): id is string => !!id) || [];

    // Find sources by their lightrag_doc_id
    if (relatedDocIds.length) {
      const { data: related } = await supabase
        .from("listening_station_sources")
        .select("id")
        .in("lightrag_doc_id", relatedDocIds)
        .not("id", "in", `(${existingSourceIds.join(",")})`);

      return related?.map((s) => s.id) || [];
    }

    return [];
  } catch {
    console.log("LightRAG not available — skipping semantic enrichment");
    return [];
  }
}

/**
 * Ingest a transcript into LightRAG for future semantic search
 */
export async function indexInLightRAG(
  sourceId: string,
  title: string,
  transcript: string
): Promise<string | null> {
  try {
    const response = await fetch(`${LIGHTRAG_URL}/api/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: transcript,
        metadata: {
          source_id: sourceId,
          title,
          type: "listening_station",
        },
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      console.log("LightRAG indexing skipped — service not available");
      return null;
    }

    const data = await response.json();
    return data.doc_id || null;
  } catch {
    console.log("LightRAG indexing skipped — service not available");
    return null;
  }
}
