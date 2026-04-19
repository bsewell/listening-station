"use client";

import { useState } from "react";
import Markdown from "react-markdown";

type TabId = "interview" | "blog" | "social" | "audio";

interface EpisodeTabsProps {
  interview: string | null;
  blog: string | null;
  socialClips: unknown[] | null;
  audioScript: string | null;
}

export function EpisodeTabs({
  interview,
  blog,
  socialClips,
  audioScript,
}: EpisodeTabsProps) {
  const [active, setActive] = useState<TabId>("interview");

  const tabs: { id: TabId; label: string; available: boolean }[] = [
    { id: "interview", label: "Interview", available: !!interview },
    { id: "blog", label: "Blog Post", available: !!blog },
    { id: "social", label: "Social Clips", available: !!socialClips?.length },
    { id: "audio", label: "Audio Script", available: !!audioScript },
  ];

  return (
    <div>
      <div className="flex gap-1 border-b border-border mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            disabled={!tab.available}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              active === tab.id
                ? "border-accent text-accent"
                : tab.available
                  ? "border-transparent text-muted hover:text-foreground"
                  : "border-transparent text-muted/30 cursor-not-allowed"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-surface border border-border rounded-lg">
        {active === "interview" && interview && (
          <ContentPanel content={interview} />
        )}

        {active === "blog" && blog && <ContentPanel content={blog} />}

        {active === "social" && socialClips && (
          <div className="p-6 space-y-4">
            {(socialClips as SocialClip[]).map(
              (clip: SocialClip, i: number) => (
                <div
                  key={i}
                  className="bg-background border border-border rounded-lg p-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-accent uppercase">
                      {clip.platform || "general"}
                    </span>
                    <button
                      onClick={() => navigator.clipboard.writeText(clip.text)}
                      className="text-xs text-muted hover:text-foreground transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                  <p className="text-sm">{clip.text}</p>
                  {clip.source && (
                    <p className="text-xs text-muted">Source: {clip.source}</p>
                  )}
                  <p className="text-xs text-muted">
                    {clip.text.length} characters
                  </p>
                </div>
              )
            )}
          </div>
        )}

        {active === "audio" && audioScript && (
          <ContentPanel content={audioScript} />
        )}
      </div>
    </div>
  );
}

interface SocialClip {
  text: string;
  platform?: string;
  source?: string;
}

function ContentPanel({ content }: { content: string }) {
  return (
    <div className="p-6 max-h-[70vh] overflow-y-auto">
      <div className="prose prose-invert prose-sm max-w-none font-sans leading-relaxed">
        <Markdown>{content}</Markdown>
      </div>
    </div>
  );
}
