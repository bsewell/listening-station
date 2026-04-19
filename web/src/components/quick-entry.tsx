"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

export function QuickEntry() {
  const [url, setUrl] = useState("");
  const [tags, setTags] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setMessage(data.error || "Failed");
        return;
      }

      setStatus("success");
      setMessage(`${data.title} — ${data.wordCount?.toLocaleString() || 0} words`);
      setUrl("");
      setTags("");
      setExpanded(false);

      // Refresh the page to show new source
      setTimeout(() => {
        setStatus("idle");
        setMessage("");
        router.refresh();
      }, 2000);
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Unknown error");
    }
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-1">
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="url"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (e.target.value && !expanded) setExpanded(true);
          }}
          placeholder="Paste a YouTube, podcast, or article URL..."
          className="flex-1 bg-transparent px-4 py-3 text-sm focus:outline-none placeholder:text-muted/40"
          disabled={status === "loading"}
        />

        {expanded && (
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="tags..."
            className="w-40 bg-background border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-accent/50 placeholder:text-muted/40"
          />
        )}

        <button
          type="submit"
          disabled={status === "loading" || !url.trim()}
          className="bg-accent hover:bg-accent-hover disabled:opacity-30 text-white px-5 py-2 rounded-lg text-sm font-medium transition-all shrink-0"
        >
          {status === "loading" ? (
            <span className="flex items-center gap-2">
              <Spinner /> Ingesting...
            </span>
          ) : (
            "Add"
          )}
        </button>
      </form>

      {/* Status Messages */}
      {status === "success" && message && (
        <div className="px-4 pb-3 text-xs text-success flex items-center gap-1.5">
          <span>✓</span> {message}
        </div>
      )}
      {status === "error" && message && (
        <div className="px-4 pb-3 text-xs text-error flex items-center gap-1.5">
          <span>✗</span> {message}
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
