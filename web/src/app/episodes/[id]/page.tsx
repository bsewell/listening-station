import { createServerClient } from "@/lib/supabase";
import { EpisodeTabs } from "./tabs";

export const dynamic = "force-dynamic";

export default async function EpisodeDetail(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const supabase = createServerClient();

  const { data: episode } = await supabase
    .from("listening_station_episodes")
    .select("*")
    .eq("id", id)
    .single();

  if (!episode) {
    return (
      <div className="text-center py-20">
        <p className="text-muted">Episode not found</p>
      </div>
    );
  }

  // Load cluster and sources for context
  let cluster = null;
  let sources: { url: string; title: string; author: string; source_type: string }[] = [];

  if (episode.cluster_id) {
    const { data: c } = await supabase
      .from("listening_station_clusters")
      .select("*")
      .eq("id", episode.cluster_id)
      .single();
    cluster = c;

    if (c?.source_ids?.length) {
      const { data: s } = await supabase
        .from("listening_station_sources")
        .select("url, title, author, source_type")
        .in("id", c.source_ids);
      sources = s || [];
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-muted">
              Episode #{episode.episode_number}
            </span>
            <StatusBadge status={episode.status} />
          </div>
          <h1 className="text-2xl font-bold mt-1">
            {episode.title || episode.slug}
          </h1>
          <p className="text-sm text-muted mt-1">
            {episode.slug} · Created{" "}
            {new Date(episode.created_at).toLocaleDateString()}
            {episode.published_at &&
              ` · Published ${new Date(episode.published_at).toLocaleDateString()}`}
          </p>
        </div>
      </div>

      {sources.length > 0 && (
        <div className="bg-surface border border-border rounded-lg p-4">
          <p className="text-xs font-medium text-muted uppercase mb-2">
            Sources ({sources.length})
          </p>
          <div className="space-y-1">
            {sources.map((s, i) => (
              <a
                key={i}
                href={s.url}
                target="_blank"
                rel="noopener"
                className="block text-sm hover:text-accent transition-colors"
              >
                {s.title || s.url}{" "}
                <span className="text-muted">
                  — {s.author} ({s.source_type})
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      <EpisodeTabs
        interview={episode.interview_md}
        blog={episode.blog_md}
        socialClips={episode.social_clips}
        audioScript={episode.audio_script}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: "bg-warning/15 text-warning",
    review: "bg-accent/15 text-accent",
    published: "bg-success/15 text-success",
  };
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[status] || "bg-border text-muted"}`}
    >
      {status}
    </span>
  );
}
