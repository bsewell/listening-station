import { createServerClient } from "@/lib/supabase";
import { QuickEntry } from "@/components/quick-entry";
import { SourceCard } from "@/components/source-card";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const supabase = createServerClient();

  const [
    { count: sourceCount },
    { count: clusterCount },
    { count: episodeCount },
    { count: insightCount },
    { count: pendingInsightCount },
    { data: sources },
    { data: episodes },
  ] = await Promise.all([
    supabase
      .from("listening_station_sources")
      .select("*", { count: "exact", head: true }),
    supabase
      .from("listening_station_clusters")
      .select("*", { count: "exact", head: true }),
    supabase
      .from("listening_station_episodes")
      .select("*", { count: "exact", head: true }),
    supabase
      .from("listening_station_insights")
      .select("*", { count: "exact", head: true }),
    supabase
      .from("listening_station_insights")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("listening_station_sources")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("listening_station_episodes")
      .select("id, title, slug, episode_number, status, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  return (
    <div className="space-y-8">
      {/* Quick Entry */}
      <QuickEntry />

      {/* Stats Bar */}
      <div className="flex gap-6 text-sm">
        <a href="/sources" className="text-muted hover:text-foreground transition-colors">
          <span className="text-foreground font-bold text-lg">{sourceCount ?? 0}</span> sources
        </a>
        <a href="/clusters" className="text-muted hover:text-foreground transition-colors">
          <span className="text-foreground font-bold text-lg">{clusterCount ?? 0}</span> clusters
        </a>
        <a href="/knowledge" className="text-muted hover:text-foreground transition-colors">
          <span className="text-foreground font-bold text-lg">{insightCount ?? 0}</span> insights
          {(pendingInsightCount ?? 0) > 0 && (
            <span className="text-warning ml-1">({pendingInsightCount} pending)</span>
          )}
        </a>
        <a href="/episodes" className="text-muted hover:text-foreground transition-colors">
          <span className="text-foreground font-bold text-lg">{episodeCount ?? 0}</span> episodes
        </a>
      </div>

      <div className="grid grid-cols-3 gap-8">
        {/* Source Feed — Main Column */}
        <div className="col-span-2 space-y-3">
          <h2 className="text-sm font-medium text-muted uppercase tracking-wider">
            Feed
          </h2>
          {sources?.map((s) => (
            <SourceCard key={s.id} source={s} />
          ))}
          {!sources?.length && (
            <div className="text-center py-12 text-muted text-sm bg-surface border border-border rounded-lg">
              No sources yet. Paste a URL above to get started.
            </div>
          )}
        </div>

        {/* Episodes Sidebar */}
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted uppercase tracking-wider">
            Episodes
          </h2>
          {episodes?.map((ep) => (
            <a
              key={ep.id}
              href={`/episodes/${ep.id}`}
              className="bg-surface border border-border rounded-lg p-4 hover:bg-surface-hover transition-colors block"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono text-muted">#{ep.episode_number}</span>
                <StatusBadge status={ep.status} />
              </div>
              <p className="text-sm font-medium">{ep.title || ep.slug}</p>
              <p className="text-xs text-muted mt-1">
                {new Date(ep.created_at).toLocaleDateString()}
              </p>
            </a>
          ))}
          {!episodes?.length && (
            <div className="text-center py-8 text-muted text-sm bg-surface border border-border rounded-lg">
              No episodes yet.
            </div>
          )}
        </div>
      </div>
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
