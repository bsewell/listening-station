"use client";

import { useState } from "react";

export default function IngestPage() {
  const [url, setUrl] = useState("");
  const [tags, setTags] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [result, setResult] = useState<string>("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    setStatus("loading");
    setResult("");

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
        setResult(data.error || "Ingest failed");
        return;
      }

      setStatus("success");
      setResult(
        `Ingested: "${data.title}" (${data.wordCount || 0} words, status: ${data.status})`
      );
      setUrl("");
      setTags("");
    } catch (err) {
      setStatus("error");
      setResult(err instanceof Error ? err.message : "Unknown error");
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Ingest</h1>
      <p className="text-muted text-sm">
        Paste a YouTube, podcast, or article URL to ingest into the Listening Station.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5">URL</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://youtube.com/watch?v=..."
            required
            className="w-full bg-surface border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent placeholder:text-muted/50"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">
            Tags <span className="text-muted font-normal">(comma-separated)</span>
          </label>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="claude, ai-tools, health-tech"
            className="w-full bg-surface border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent placeholder:text-muted/50"
          />
        </div>

        <button
          type="submit"
          disabled={status === "loading"}
          className="bg-accent hover:bg-accent-hover disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          {status === "loading" ? "Ingesting..." : "Ingest URL"}
        </button>
      </form>

      {status === "success" && (
        <div className="bg-success/10 border border-success/30 rounded-lg p-4 text-sm text-success">
          {result}
        </div>
      )}
      {status === "error" && (
        <div className="bg-error/10 border border-error/30 rounded-lg p-4 text-sm text-error">
          {result}
        </div>
      )}
    </div>
  );
}
