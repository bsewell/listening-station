import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export async function POST(request: Request) {
  const supabase = createServerClient();

  let body: { insightId: string; action: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { insightId, action, reason } = body;

  if (!insightId || !action) {
    return NextResponse.json(
      { error: "insightId and action are required" },
      { status: 400 }
    );
  }

  const statusMap: Record<string, string> = {
    accept: "accepted",
    reject: "rejected",
    star: "starred",
  };

  const newStatus = statusMap[action];
  if (!newStatus) {
    return NextResponse.json(
      { error: "action must be accept, reject, or star" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("listening_station_insights")
    .update({
      status: newStatus,
      rejected_reason: action === "reject" ? reason || null : null,
    })
    .eq("id", insightId)
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: `Update failed: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ id: data.id, status: data.status });
}
