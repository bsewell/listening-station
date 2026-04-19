import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export async function GET() {
  const supabase = createServerClient();

  const { data: categories } = await supabase
    .from("listening_station_categories")
    .select("*")
    .order("sort_order");

  if (!categories) {
    return NextResponse.json([]);
  }

  // Get counts per category
  const { data: insights } = await supabase
    .from("listening_station_insights")
    .select("category_id, status");

  const countMap = new Map<string, { total: number; pending: number }>();
  for (const i of insights || []) {
    const entry = countMap.get(i.category_id) || { total: 0, pending: 0 };
    entry.total++;
    if (i.status === "pending") entry.pending++;
    countMap.set(i.category_id, entry);
  }

  const result = categories.map((c) => ({
    ...c,
    count: countMap.get(c.id)?.total || 0,
    pending: countMap.get(c.id)?.pending || 0,
  }));

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const supabase = createServerClient();

  let body: { name: string; color?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, color } = body;
  if (!name) {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 }
    );
  }

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const { data: existing } = await supabase
    .from("listening_station_categories")
    .select("id")
    .order("sort_order", { ascending: false })
    .limit(1);

  const nextOrder = existing?.[0]
    ? (existing[0] as { sort_order?: number }).sort_order ?? 0 + 1
    : 0;

  const { data, error } = await supabase
    .from("listening_station_categories")
    .insert({
      name,
      slug,
      color: color || "#6366f1",
      sort_order: nextOrder,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: `Create failed: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}
