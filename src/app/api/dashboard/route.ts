import { NextResponse } from "next/server";
import { getOwnedRestaurant } from "@/lib/auth";
import { getAdmin } from "@/lib/supabase-admin";
import type { DashboardResponse, DashboardStats } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/dashboard?days=14 — শুধু নিজের রেস্টুরেন্টের পরিসংখ্যান */
export async function GET(req: Request) {
  try {
    const restaurant = await getOwnedRestaurant(req);
    if (!restaurant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const daysParam = Number(new URL(req.url).searchParams.get("days") ?? 14);
    const days = Number.isInteger(daysParam) ? Math.min(Math.max(daysParam, 7), 90) : 14;

    const { data, error } = await getAdmin().rpc("restaurant_stats", {
      p_restaurant: restaurant.id,
      p_days: days,
    });
    if (error || !data) {
      console.error("restaurant_stats failed", error);
      return NextResponse.json({ error: "পরিসংখ্যান লোড করা যায়নি" }, { status: 500 });
    }

    const body: DashboardResponse = {
      restaurant: { name: restaurant.name, slug: restaurant.slug, plan: restaurant.plan },
      stats: data as DashboardStats,
    };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("dashboard route error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
