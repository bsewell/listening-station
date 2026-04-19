import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function ClustersPage() {
  const supabase = createServerClient();

  const { data: clusters } = await supabase
    .from("listening_station_clusters")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Clusters</h1>

      <div className="grid gap-4">
        {clusters?.map((c) => (
          <div
            key={c.id}
            className="bg-surface border border-border rounded-lg p-5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{c.topic}</h2>
              <StatusBadge status={c.status} />
            </div>

            <p className="text-sm text-muted">
              {c.source_ids?.length || 0} sources ·{" "}
              {c.interview_questions?.length || 0} interview questions
            </p>

            {c.description && (
              <p className="text-sm text-muted">{c.description}</p>
            )}

            {c.briefing && (
              <details className="group">
                <summary className="text-sm text-accent cursor-pointer hover:text-accent-hover">
                  View Briefing
                </summary>
                <div className="mt-3 bg-background rounded-lg p-4 text-sm whitespace-pre-wrap max-h-96 overflow-y-auto border border-border">
                  {c.briefing}
                </div>
              </details>
            )}

            {c.interview_questions?.length > 0 && (
              <details className="group">
                <summary className="text-sm text-accent cursor-pointer hover:text-accent-hover">
                  Interview Questions ({c.interview_questions.length})
                </summary>
                <ol className="mt-3 space-y-1.5 text-sm list-decimal list-inside">
                  {c.interview_questions.map((q: string, i: number) => (
                    <li key={i} className="text-muted">
                      {q}
                    </li>
                  ))}
                </ol>
              </details>
            )}

            <p className="text-xs text-muted">
              Created {new Date(c.created_at).toLocaleDateString()} · ID: {c.id}
            </p>
          </div>
        ))}
        {!clusters?.length && (
          <p className="text-center text-muted py-8 text-sm">
            No clusters yet. Ingest sources and tag them to create clusters.
          </p>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: "bg-warning/15 text-warning",
    briefed: "bg-accent/15 text-accent",
    interviewed: "bg-accent/15 text-accent",
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
