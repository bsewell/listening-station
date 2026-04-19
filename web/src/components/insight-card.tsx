"use client";

import { useState } from "react";

interface InsightCardProps {
  insight: {
    id: string;
    topic: string;
    subtopic: string | null;
    insight: string;
    evidence: string | null;
    relevance: string | null;
    confidence: number;
    status: string;
    source_title: string | null;
    source_author: string | null;
    source_url: string | null;
    category_name: string | null;
    category_color: string | null;
  };
  onStatusChange?: (id: string, newStatus: string) => void;
}

export function InsightCard({ insight, onStatusChange }: InsightCardProps) {
  const [status, setStatus] = useState(insight.status);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleAction(action: "accept" | "reject" | "star") {
    setLoading(true);
    try {
      const res = await fetch("/api/knowledge/curate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ insightId: insight.id, action }),
      });
      if (res.ok) {
        const newStatus =
          action === "accept"
            ? "accepted"
            : action === "reject"
              ? "rejected"
              : "starred";
        setStatus(newStatus);
        onStatusChange?.(insight.id, newStatus);
      }
    } finally {
      setLoading(false);
    }
  }

  const confidenceColor =
    insight.confidence > 0.7
      ? "bg-success"
      : insight.confidence > 0.4
        ? "bg-warning"
        : "bg-error";

  const statusStyles: Record<string, string> = {
    pending: "",
    accepted: "border-success/30",
    rejected: "opacity-50 border-error/30",
    starred: "border-warning/30",
  };

  return (
    <div
      className={`bg-surface border border-border rounded-lg p-4 transition-all ${statusStyles[status] || ""}`}
    >
      {/* Header: Category + Topic */}
      <div className="flex items-center gap-2 mb-2">
        {insight.category_name && (
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{
              backgroundColor: `${insight.category_color || "#6366f1"}20`,
              color: insight.category_color || "#6366f1",
            }}
          >
            {insight.category_name}
          </span>
        )}
        <span className="text-xs text-muted">
          {insight.topic}
          {insight.subtopic && ` › ${insight.subtopic}`}
        </span>
      </div>

      {/* Insight text */}
      <p className="text-sm font-medium leading-relaxed mb-2">
        {status === "starred" && "★ "}
        {insight.insight}
      </p>

      {/* Confidence bar */}
      <div className="flex items-center gap-2 mb-2">
        <div className="h-1 flex-1 bg-border rounded-full overflow-hidden">
          <div
            className={`h-full ${confidenceColor} rounded-full`}
            style={{ width: `${insight.confidence * 100}%` }}
          />
        </div>
        <span className="text-xs text-muted">
          {Math.round(insight.confidence * 100)}%
        </span>
      </div>

      {/* Evidence (expandable) */}
      {insight.evidence && (
        <div className="mb-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-muted hover:text-foreground transition-colors"
          >
            {expanded ? "Hide evidence ▲" : "Show evidence ▼"}
          </button>
          {expanded && (
            <blockquote className="mt-1 pl-3 border-l-2 border-accent/30 text-xs text-muted italic">
              {insight.evidence}
            </blockquote>
          )}
        </div>
      )}

      {/* Relevance */}
      {insight.relevance && expanded && (
        <p className="text-xs text-muted mb-2">
          <span className="text-accent">GIStudio:</span> {insight.relevance}
        </p>
      )}

      {/* Source attribution */}
      {insight.source_title && (
        <p className="text-xs text-muted mb-3">
          From:{" "}
          {insight.source_url ? (
            <a
              href={insight.source_url}
              target="_blank"
              rel="noopener"
              className="hover:text-accent transition-colors"
            >
              {insight.source_title}
            </a>
          ) : (
            insight.source_title
          )}
          {insight.source_author && ` by ${insight.source_author}`}
        </p>
      )}

      {/* Actions */}
      {status === "pending" && (
        <div className="flex gap-2">
          <button
            onClick={() => handleAction("accept")}
            disabled={loading}
            className="px-3 py-1 text-xs font-medium rounded bg-success/15 text-success hover:bg-success/25 transition-colors disabled:opacity-50"
          >
            Accept
          </button>
          <button
            onClick={() => handleAction("star")}
            disabled={loading}
            className="px-3 py-1 text-xs font-medium rounded bg-warning/15 text-warning hover:bg-warning/25 transition-colors disabled:opacity-50"
          >
            Star
          </button>
          <button
            onClick={() => handleAction("reject")}
            disabled={loading}
            className="px-3 py-1 text-xs font-medium rounded bg-error/15 text-error hover:bg-error/25 transition-colors disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      )}

      {/* Status indicator for already-curated */}
      {status !== "pending" && (
        <div className="flex items-center gap-2">
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              status === "accepted"
                ? "bg-success/15 text-success"
                : status === "starred"
                  ? "bg-warning/15 text-warning"
                  : "bg-error/15 text-error"
            }`}
          >
            {status}
          </span>
          <button
            onClick={() => handleAction(status === "starred" ? "accept" : "star")}
            disabled={loading}
            className="text-xs text-muted hover:text-foreground transition-colors"
          >
            {status === "starred" ? "Unstar" : status === "accepted" ? "Star" : "Undo"}
          </button>
        </div>
      )}
    </div>
  );
}
