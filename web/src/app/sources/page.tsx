import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const supabase = createServerClient();

  const { data: sources } = await supabase
    .from("listening_station_sources")
    .select("id, url, title, author, source_type, status, topic_tags, word_count, duration_seconds, created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Sources</h1>
        <a
          href="/ingest"
          className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + Ingest URL
        </a>
      </div>

      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium w-24">Type</th>
              <th className="px-4 py-3 font-medium w-24">Words</th>
              <th className="px-4 py-3 font-medium w-28">Tags</th>
              <th className="px-4 py-3 font-medium w-24">Status</th>
              <th className="px-4 py-3 font-medium w-28">Date</th>
            </tr>
          </thead>
          <tbody>
            {sources?.map((s) => (
              <tr
                key={s.id}
                className="border-b border-border last:border-0 hover:bg-surface-hover transition-colors"
              >
                <td className="px-4 py-3">
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener"
                    className="hover:text-accent transition-colors"
                  >
                    {s.title || "Untitled"}
                  </a>
                  {s.author && (
                    <span className="text-muted ml-2">by {s.author}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <TypeBadge type={s.source_type} />
                </td>
                <td className="px-4 py-3 text-muted">
                  {s.word_count?.toLocaleString() || "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {s.topic_tags?.map((tag: string) => (
                      <span
                        key={tag}
                        className="text-xs bg-border px-1.5 py-0.5 rounded"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={s.status} />
                </td>
                <td className="px-4 py-3 text-muted text-xs">
                  {new Date(s.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!sources?.length && (
          <p className="text-center text-muted py-8 text-sm">
            No sources ingested yet.
          </p>
        )}
      </div>
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  const icons: Record<string, string> = {
    youtube: "▶",
    podcast: "🎙",
    article: "📄",
  };
  return (
    <span className="text-xs bg-border px-2 py-0.5 rounded">
      {icons[type] || ""} {type}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    ready: "bg-success/15 text-success",
    pending: "bg-warning/15 text-warning",
    transcribing: "bg-accent/15 text-accent",
    error: "bg-error/15 text-error",
  };
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[status] || "bg-border text-muted"}`}
    >
      {status}
    </span>
  );
}
