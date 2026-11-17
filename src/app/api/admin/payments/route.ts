import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { METHODS_REQUIRING_REFERENCE, isPaymentMethod, isPlan } from "@/lib/plans";
import { getAdmin } from "@/lib/supabase-admin";
import type { AdminPayment } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/admin/payments?restaurant=<uuid>&limit=100 — পেমেন্টের খাতা (নতুন আগে) */
export async function GET(req: Request) {
  try {
    const check = await requireAdmin(req);
    if (!check.ok) return check.response;

    const url = new URL(req.url);
    const restaurant = url.searchParams.get("restaurant");
    const limitParam = Number(url.searchParams.get("limit") ?? 200);
    const limit = Number.isInteger(limitParam) ? Math.min(Math.max(limitParam, 1), 500) : 200;

    let query = getAdmin()
      .from("payments")
      .select("id, amount, plan, method, reference, period_days, note, paid_at, restaurants(name, slug)")
      .order("paid_at", { ascending: false })
      .limit(limit);

    if (restaurant) {
      if (!UUID.test(restaurant)) return NextResponse.json({ error: "অবৈধ restaurant id" }, { status: 400 });
      query = query.eq("restaurant_id", restaurant);
    }

    const { data, error } = await query;
    if (error) {
      console.error("payments list failed", error);
      return NextResponse.json({ error: "পেমেন্ট তালিকা লোড করা যায়নি" }, { status: 500 });
    }
    return NextResponse.json(
      { payments: (data ?? []) as unknown as AdminPayment[], limit },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("admin payments GET error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * POST /api/admin/payments
 * { restaurantId, amount, plan, method, reference?, periodDays?, note? }
 * পেমেন্ট রেকর্ড করে এবং মেয়াদ বাড়ায় — দুটোই DB ফাংশনে একসাথে (atomic)।
 */
export async function POST(req: Request) {
  try {
    const check = await requireAdmin(req);
    if (!check.ok) return check.response;

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "অবৈধ অনুরোধ" }, { status: 400 });
    }

    const restaurantId = typeof body.restaurantId === "string" ? body.restaurantId : "";
    if (!UUID.test(restaurantId)) return NextResponse.json({ error: "রেস্টুরেন্ট বাছুন" }, { status: 400 });

    const amount = body.amount;
    if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 1 || amount > 1_000_000) {
      return NextResponse.json({ error: "পরিমাণ ১–১০,০০,০০০ টাকার মধ্যে পূর্ণসংখ্যা হতে হবে" }, { status: 400 });
    }
    if (!isPlan(body.plan)) return NextResponse.json({ error: "অবৈধ প্ল্যান" }, { status: 400 });
    if (!isPaymentMethod(body.method)) return NextResponse.json({ error: "অবৈধ পেমেন্ট মাধ্যম" }, { status: 400 });

    const periodDays = body.periodDays === undefined ? 30 : body.periodDays;
    if (typeof periodDays !== "number" || !Number.isInteger(periodDays) || periodDays < 1 || periodDays > 366) {
      return NextResponse.json({ error: "মেয়াদ ১–৩৬৬ দিনের মধ্যে হতে হবে" }, { status: 400 });
    }

    const reference = typeof body.reference === "string" ? body.reference.trim().toUpperCase() : "";
    if (METHODS_REQUIRING_REFERENCE.includes(body.method) && reference.length === 0) {
      return NextResponse.json({ error: "এই মাধ্যমে ট্রানজেকশন আইডি (TrxID) দিতে হবে" }, { status: 400 });
    }
    if (reference && (reference.length < 3 || reference.length > 64)) {
      return NextResponse.json({ error: "ট্রানজেকশন আইডি ৩–৬৪ অক্ষরের হতে হবে" }, { status: 400 });
    }

    const note = typeof body.note === "string" ? body.note.trim() : "";
    if (note.length > 300) return NextResponse.json({ error: "নোট সর্বোচ্চ ৩০০ অক্ষর" }, { status: 400 });

    const { data, error } = await getAdmin().rpc("record_payment", {
      p_restaurant: restaurantId,
      p_amount: amount,
      p_plan: body.plan,
      p_method: body.method,
      p_reference: reference || null,
      p_period_days: periodDays,
      p_note: note || null,
      p_admin: check.userId,
    });

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "এই ট্রানজেকশন আইডি এই মাধ্যমে আগেই রেকর্ড করা হয়েছে" }, { status: 409 });
      }
      if (error.code === "P0002") {
        return NextResponse.json({ error: "রেস্টুরেন্ট পাওয়া যায়নি" }, { status: 404 });
      }
      console.error("record_payment failed", error);
      return NextResponse.json({ error: "পেমেন্ট রেকর্ড করা যায়নি" }, { status: 500 });
    }

    const result = data as { payment_id: string; service_until: string };
    return NextResponse.json({ paymentId: result.payment_id, serviceUntil: result.service_until }, { status: 201 });
  } catch (err) {
    console.error("admin payments POST error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
