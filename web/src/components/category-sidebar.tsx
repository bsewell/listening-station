"use client";

import { useRouter, useSearchParams } from "next/navigation";

interface Category {
  id: string;
  name: string;
  slug: string;
  color: string;
  count: number;
  pending: number;
}

interface CategorySidebarProps {
  categories: Category[];
  activeSlug: string | null;
}

export function CategorySidebar({
  categories,
  activeSlug,
}: CategorySidebarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleClick(slug: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (slug) {
      params.set("category", slug);
    } else {
      params.delete("category");
    }
    router.push(`/knowledge?${params.toString()}`);
  }

  const totalCount = categories.reduce((sum, c) => sum + c.count, 0);
  const totalPending = categories.reduce((sum, c) => sum + c.pending, 0);

  return (
    <div className="space-y-1">
      <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-3">
        Categories
      </h3>

      <button
        onClick={() => handleClick(null)}
        className={`w-full flex items-center justify-between px-3 py-2 rounded text-sm transition-colors ${
          !activeSlug
            ? "bg-accent/15 text-accent font-medium"
            : "text-muted hover:text-foreground hover:bg-surface-hover"
        }`}
      >
        <span>All</span>
        <span className="text-xs">
          {totalCount}
          {totalPending > 0 && (
            <span className="ml-1 text-warning">({totalPending})</span>
          )}
        </span>
      </button>

      {categories.map((cat) => (
        <button
          key={cat.slug}
          onClick={() => handleClick(cat.slug)}
          className={`w-full flex items-center justify-between px-3 py-2 rounded text-sm transition-colors ${
            activeSlug === cat.slug
              ? "bg-accent/15 text-accent font-medium"
              : "text-muted hover:text-foreground hover:bg-surface-hover"
          }`}
        >
          <span className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: cat.color }}
            />
            {cat.name}
          </span>
          <span className="text-xs">
            {cat.count}
            {cat.pending > 0 && (
              <span className="ml-1 text-warning">({cat.pending})</span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}
