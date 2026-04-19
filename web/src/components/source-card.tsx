"use client";

import { useState } from "react";

interface Source {
  id: string;
  url: string;
  title: string | null;
  author: string | null;
  source_type: string;
  status: string;
  topic_tags: string[] | null;
  word_count: number | null;
  duration_seconds: number | null;
  transcript: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface Summary {
  keyTakeaways: string[];
  whyItMatters: string;
  repos: RepoLink[];
  links: ExternalLink[];
}

interface RepoLink {
  url: string;
  name: string;
}

interface ExternalLink {
  url: string;
  label: string;
}

export function SourceCard({ source }: { source: Source }) {
  const [expanded, setExpanded] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);

  const typeIcons: Record<string, string> = {
    youtube: "▶",
    podcast: "🎙",
    article: "📄",
  };

  const thumbnailUrl =
    source.source_type === "youtube" && source.metadata?.videoId
      ? `https://i.ytimg.com/vi/${source.metadata.videoId}/mqdefault.jpg`
      : null;

  async function handleExpand() {
    if (expanded) {
      setExpanded(false);
      return;
    }

    setExpanded(true);

    if (!summary && source.status === "ready") {
      setLoading(true);
      try {
        const res = await fetch(`/api/summarize/${source.id}`);
        if (res.ok) {
          setSummary(await res.json());
        }
      } catch {
        // Summary generation failed — still show what we have
      }
      setLoading(false);
    }
  }

  const duration = source.duration_seconds
    ? formatDuration(source.duration_seconds)
    : null;

  return (
    <div
      className={`bg-surface border rounded-lg transition-all ${
        expanded ? "border-accent/40" : "border-border hover:border-border"
      }`}
    >
      {/* Card Header — always visible */}
      <button
        onClick={handleExpand}
        className="w-full text-left p-4 flex gap-4 items-start"
      >
        {/* Thumbnail */}
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt=""
            className="w-28 h-16 rounded object-cover shrink-0 bg-border"
          />
        ) : (
          <div className="w-28 h-16 rounded bg-border flex items-center justify-center text-2xl shrink-0">
            {typeIcons[source.source_type] || "📎"}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold leading-tight line-clamp-2">
              {source.title || "Untitled"}
            </h3>
            <StatusDot status={source.status} />
          </div>

          <div className="flex items-center gap-2 mt-1.5 text-xs text-muted">
            {source.author && <span>{source.author}</span>}
            {source.author && duration && <span>·</span>}
            {duration && <span>{duration}</span>}
            {source.word_count && (
              <>
                <span>·</span>
                <span>{source.word_count.toLocaleString()} words</span>
              </>
            )}
          </div>

          {source.topic_tags && source.topic_tags.length > 0 && (
            <div className="flex gap-1 mt-2">
              {source.topic_tags.map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] bg-accent/10 text-accent px-1.5 py-0.5 rounded font-medium"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="border-t border-border">
          {loading && (
            <div className="p-6 flex items-center gap-2 text-sm text-muted">
              <Spinner /> Generating summary...
            </div>
          )}

          {summary && (
            <div className="p-5 space-y-4">
              {/* What You Can Learn */}
              <div>
                <h4 className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
                  What you can learn
                </h4>
                <ul className="space-y-1.5">
                  {summary.keyTakeaways.map((t, i) => (
                    <li key={i} className="text-sm flex gap-2">
                      <span className="text-accent shrink-0 mt-0.5">→</span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Why It Matters */}
              <div>
                <h4 className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
                  Why it matters for GIStudio
                </h4>
                <p className="text-sm text-muted leading-relaxed">
                  {summary.whyItMatters}
                </p>
              </div>

              {/* GitHub Repos */}
              {summary.repos.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
                    Repositories
                  </h4>
                  <div className="space-y-1.5">
                    {summary.repos.map((repo, i) => (
                      <a
                        key={i}
                        href={repo.url}
                        target="_blank"
                        rel="noopener"
                        className="flex items-center gap-2 text-sm text-accent hover:text-accent-hover transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <GithubIcon />
                        {repo.name}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* External Links */}
              {summary.links.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
                    Links mentioned
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {summary.links.map((link, i) => (
                      <a
                        key={i}
                        href={link.url}
                        target="_blank"
                        rel="noopener"
                        className="text-xs bg-border hover:bg-surface-hover px-2.5 py-1 rounded transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {link.label}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* If no summary yet but we have transcript, show fallback */}
          {!loading && !summary && source.status === "ready" && (
            <div className="p-5 text-sm text-muted">
              Transcript available ({source.word_count?.toLocaleString()} words). Summary will load shortly.
            </div>
          )}

          {/* Source link */}
          <div className="border-t border-border px-5 py-3 flex items-center justify-between">
            <a
              href={source.url}
              target="_blank"
              rel="noopener"
              className="text-xs text-muted hover:text-accent transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              View original →
            </a>
            <span className="text-[10px] text-muted font-mono">
              {source.id.slice(0, 8)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    ready: "bg-success",
    pending: "bg-warning",
    transcribing: "bg-accent",
    error: "bg-error",
  };
  return (
    <span
      className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${colors[status] || "bg-border"}`}
      title={status}
    />
  );
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function Spinner() {
  return (
    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function GithubIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}
