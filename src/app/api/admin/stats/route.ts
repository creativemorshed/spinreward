import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { monthlyRecurringRevenue } from "@/lib/plans";
import { getAdmin } from "@/lib/supabase-admin";
import type { AdminStatsResponse, PlatformStats } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/stats — প্ল্যাটফর্মজুড়ে পরিসংখ্যান + MRR */
export async function GET(req: Request) {
  try {
    const check = await requireAdmin(req);
    if (!check.ok) return check.response;

    const { data, error } = await getAdmin().rpc("platform_stats", { p_days: 14 });
    if (error || !data) {
      console.error("platform_stats failed", error);
      return NextResponse.json({ error: "পরিসংখ্যান লোড করা যায়নি" }, { status: 500 });
    }

    const stats = data as PlatformStats;
    const body: AdminStatsResponse = { stats, mrr: monthlyRecurringRevenue(stats.paying_by_plan) };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("admin stats error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
