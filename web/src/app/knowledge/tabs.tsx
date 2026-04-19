"use client";

import { useRouter } from "next/navigation";

interface KnowledgeTabsProps {
  activeStatus: string;
  activeCategory: string | null;
}

const statuses = [
  { id: "pending", label: "Pending" },
  { id: "accepted", label: "Accepted" },
  { id: "starred", label: "Starred" },
  { id: "all", label: "All" },
];

export function KnowledgeTabs({
  activeStatus,
  activeCategory,
}: KnowledgeTabsProps) {
  const router = useRouter();

  function handleClick(statusId: string) {
    const params = new URLSearchParams();
    if (statusId !== "pending") params.set("status", statusId);
    if (activeCategory) params.set("category", activeCategory);
    const qs = params.toString();
    router.push(`/knowledge${qs ? `?${qs}` : ""}`);
  }

  return (
    <div className="flex gap-1 border-b border-border">
      {statuses.map((s) => (
        <button
          key={s.id}
          onClick={() => handleClick(s.id)}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
            activeStatus === s.id
              ? "border-accent text-accent"
              : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
