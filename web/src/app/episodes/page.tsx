import { createServerClient } from "@/lib/supabase";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function EpisodesPage() {
  const supabase = createServerClient();

  const { data: episodes } = await supabase
    .from("listening_station_episodes")
    .select("id, title, slug, episode_number, status, created_at, published_at")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Episodes</h1>

      <div className="grid gap-4">
        {episodes?.map((ep) => (
          <Link
            key={ep.id}
            href={`/episodes/${ep.id}`}
            className="bg-surface border border-border rounded-lg p-5 hover:bg-surface-hover transition-colors block"
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-muted font-mono mr-2">
                  #{ep.episode_number}
                </span>
                <span className="font-semibold">{ep.title || ep.slug}</span>
              </div>
              <StatusBadge status={ep.status} />
            </div>
            <p className="text-xs text-muted mt-1">
              {ep.slug} · Created{" "}
              {new Date(ep.created_at).toLocaleDateString()}
              {ep.published_at &&
                ` · Published ${new Date(ep.published_at).toLocaleDateString()}`}
            </p>
          </Link>
        ))}
        {!episodes?.length && (
          <p className="text-center text-muted py-8 text-sm">
            No episodes yet. Create a cluster and run the interview pipeline.
          </p>
        )}
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
