import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getAdmin } from "@/lib/supabase-admin";
import type { AdminPaymentRequest } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/payment-requests?status=pending|all — মালিকদের জমা দেওয়া অনুরোধ (নতুন আগে) */
export async function GET(req: Request) {
  try {
    const check = await requireAdmin(req);
    if (!check.ok) return check.response;

    const status = new URL(req.url).searchParams.get("status") ?? "pending";
    if (status !== "pending" && status !== "all") {
      return NextResponse.json({ error: "status pending বা all হতে হবে" }, { status: 400 });
    }

    let query = getAdmin()
      .from("payment_requests")
      .select("id, plan, amount, method, reference, period_days, note, status, admin_note, created_at, reviewed_at, restaurants(name, slug)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (status === "pending") query = query.eq("status", "pending");

    const { data, error } = await query;
    if (error) {
      console.error("admin payment_requests list failed", error);
      return NextResponse.json({ error: "অনুরোধের তালিকা লোড করা যায়নি" }, { status: 500 });
    }
    return NextResponse.json(
      { requests: (data ?? []) as unknown as AdminPaymentRequest[] },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("admin payment-requests GET error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
