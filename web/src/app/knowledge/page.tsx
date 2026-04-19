import { createServerClient } from "@/lib/supabase";
import { InsightCard } from "@/components/insight-card";
import { CategorySidebar } from "@/components/category-sidebar";
import { KnowledgeTabs } from "./tabs";

export const dynamic = "force-dynamic";

interface SearchParams {
  category?: string;
  status?: string;
}

export default async function KnowledgePage(props: {
  searchParams: Promise<SearchParams>;
}) {
  const searchParams = await props.searchParams;
  const supabase = createServerClient();
  const activeCategory = searchParams.category || null;
  const activeStatus = searchParams.status || "pending";

  // Load categories with counts
  const { data: categories } = await supabase
    .from("listening_station_categories")
    .select("*")
    .order("sort_order");

  const { data: allInsightMeta } = await supabase
    .from("listening_station_insights")
    .select("category_id, status");

  const categoryCountMap = new Map<
    string,
    { total: number; pending: number }
  >();
  let totalPending = 0;
  let totalAccepted = 0;
  let totalStarred = 0;
  let totalAll = 0;

  for (const i of allInsightMeta || []) {
    const entry = categoryCountMap.get(i.category_id) || {
      total: 0,
      pending: 0,
    };
    entry.total++;
    if (i.status === "pending") entry.pending++;
    categoryCountMap.set(i.category_id, entry);

    totalAll++;
    if (i.status === "pending") totalPending++;
    if (i.status === "accepted") totalAccepted++;
    if (i.status === "starred") totalStarred++;
  }

  const enrichedCategories = (categories || []).map((c) => ({
    ...c,
    count: categoryCountMap.get(c.id)?.total || 0,
    pending: categoryCountMap.get(c.id)?.pending || 0,
  }));

  // Build insight query
  let query = supabase
    .from("listening_station_insights")
    .select(
      `*,
       listening_station_sources!inner(title, author, url),
       listening_station_categories(name, color)`
    )
    .order("confidence", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (activeStatus !== "all") {
    query = query.eq("status", activeStatus);
  }

  if (activeCategory) {
    const cat = enrichedCategories.find(
      (c) => c.slug === activeCategory
    );
    if (cat) {
      query = query.eq("category_id", cat.id);
    }
  }

  const { data: insights } = await query;

  // Flatten joined data for the client component
  const flatInsights = (insights || []).map((i) => {
    const source = i.listening_station_sources as {
      title: string | null;
      author: string | null;
      url: string | null;
    } | null;
    const category = i.listening_station_categories as {
      name: string | null;
      color: string | null;
    } | null;

    return {
      id: i.id,
      topic: i.topic,
      subtopic: i.subtopic,
      insight: i.insight,
      evidence: i.evidence,
      relevance: i.relevance,
      confidence: i.confidence,
      status: i.status,
      source_title: source?.title || null,
      source_author: source?.author || null,
      source_url: source?.url || null,
      category_name: category?.name || null,
      category_color: category?.color || null,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Knowledge Base</h1>
        <p className="text-sm text-muted mt-1">
          Curate insights from ingested sources into storytelling anchors
        </p>
      </div>

      {/* Stats */}
      <div className="flex gap-6 text-sm">
        <span className="text-muted">
          <span className="text-warning font-bold text-lg">
            {totalPending}
          </span>{" "}
          pending
        </span>
        <span className="text-muted">
          <span className="text-success font-bold text-lg">
            {totalAccepted}
          </span>{" "}
          accepted
        </span>
        <span className="text-muted">
          <span className="text-foreground font-bold text-lg">
            {totalStarred}
          </span>{" "}
          starred
        </span>
        <span className="text-muted">
          <span className="text-foreground font-bold text-lg">
            {totalAll}
          </span>{" "}
          total
        </span>
      </div>

      {/* Status Tabs */}
      <KnowledgeTabs activeStatus={activeStatus} activeCategory={activeCategory} />

      <div className="grid grid-cols-4 gap-6">
        {/* Category Sidebar */}
        <div className="col-span-1">
          <CategorySidebar
            categories={enrichedCategories}
            activeSlug={activeCategory}
          />
        </div>

        {/* Insight Cards */}
        <div className="col-span-3 space-y-3">
          {flatInsights.length > 0 ? (
            flatInsights.map((insight) => (
              <InsightCard key={insight.id} insight={insight} />
            ))
          ) : (
            <div className="text-center py-12 text-muted text-sm bg-surface border border-border rounded-lg">
              {totalAll === 0
                ? "No insights extracted yet. Run the extraction pipeline on your sources first."
                : `No ${activeStatus} insights${activeCategory ? ` in this category` : ""}.`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
