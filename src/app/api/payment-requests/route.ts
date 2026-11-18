import { NextResponse } from "next/server";
import { getOwnedRestaurant } from "@/lib/auth";
import { isPlan, isRenewalMonths, isRequestMethod, renewalQuote } from "@/lib/plans";
import { enforceBurstLimit } from "@/lib/ratelimit";
import { getAdmin } from "@/lib/supabase-admin";
import type { PaymentInstructions, PaymentRequest, RenewalResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** মালিককে দেখানোর পেমেন্ট নম্বর — সার্ভারের env থেকে (NEXT_PUBLIC_ নয়, তাই বান্ডেলে যায় না) */
function paymentInstructions(): PaymentInstructions {
  const pick = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);
  return {
    bkash: pick(process.env.PAYMENT_BKASH_NUMBER),
    nagad: pick(process.env.PAYMENT_NAGAD_NUMBER),
    rocket: pick(process.env.PAYMENT_ROCKET_NUMBER),
    bank: pick(process.env.PAYMENT_BANK_INFO),
  };
}

const COLUMNS = "id, plan, amount, method, reference, period_days, note, status, admin_note, created_at, reviewed_at";

/** GET /api/payment-requests — নিজের রেস্টুরেন্টের অনুরোধের ইতিহাস + পেমেন্টের নম্বর */
export async function GET(req: Request) {
  try {
    const restaurant = await getOwnedRestaurant(req);
    if (!restaurant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await getAdmin()
      .from("payment_requests")
      .select(COLUMNS)
      .eq("restaurant_id", restaurant.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) {
      console.error("payment_requests list failed", error);
      return NextResponse.json({ error: "তালিকা লোড করা যায়নি" }, { status: 500 });
    }

    const body: RenewalResponse = { requests: (data ?? []) as PaymentRequest[], instructions: paymentInstructions() };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("payment-requests GET error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * POST /api/payment-requests  { plan, months?, method, reference, note? }
 * মালিক টাকা পাঠানোর পরে TrxID জমা দেন। পরিমাণ ও মেয়াদ সার্ভারে প্ল্যান × মাস থেকে গণনা হয়।
 * মেয়াদ বাড়ে শুধু অ্যাডমিন অনুমোদন করলে।
 */
export async function POST(req: Request) {
  try {
    const restaurant = await getOwnedRestaurant(req);
    if (!restaurant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const limited = await enforceBurstLimit(req);
    if (limited) return limited;

    let body: { plan?: unknown; months?: unknown; method?: unknown; reference?: unknown; note?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "অবৈধ অনুরোধ" }, { status: 400 });
    }

    if (!isPlan(body.plan)) return NextResponse.json({ error: "অবৈধ প্ল্যান" }, { status: 400 });
    const months = body.months === undefined ? 1 : body.months;
    if (!isRenewalMonths(months)) {
      return NextResponse.json({ error: "মাস ১, ২, ৩, ৬ বা ১২ হতে হবে" }, { status: 400 });
    }
    if (!isRequestMethod(body.method)) return NextResponse.json({ error: "অবৈধ পেমেন্ট মাধ্যম" }, { status: 400 });

    // TrxID: স্পেস বাদ, বড় হাতের (bKash/Nagad-এর আইডি অক্ষর-সংখ্যা)
    const reference = (typeof body.reference === "string" ? body.reference : "").replace(/\s+/g, "").toUpperCase();
    if (reference.length < 3 || reference.length > 64) {
      return NextResponse.json({ error: "ট্রানজেকশন আইডি (TrxID) ৩–৬৪ অক্ষরের হতে হবে" }, { status: 400 });
    }
    if (!/^[A-Z0-9\-_.]+$/.test(reference)) {
      return NextResponse.json({ error: "ট্রানজেকশন আইডিতে শুধু ইংরেজি অক্ষর, সংখ্যা ও - _ . চলবে" }, { status: 400 });
    }

    const note = typeof body.note === "string" ? body.note.trim() : "";
    if (note.length > 200) return NextResponse.json({ error: "নোট সর্বোচ্চ ২০০ অক্ষর" }, { status: 400 });

    const { amount, periodDays } = renewalQuote(body.plan, months);

    const { data, error } = await getAdmin().rpc("submit_payment_request", {
      p_restaurant: restaurant.id,
      p_plan: body.plan,
      p_amount: amount,
      p_method: body.method,
      p_reference: reference,
      p_period_days: periodDays,
      p_note: note || null,
    });

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "এই ট্রানজেকশন আইডি আগেই জমা বা রেকর্ড করা হয়েছে" }, { status: 409 });
      }
      if (error.code === "P0004") {
        return NextResponse.json(
          { error: "আপনার ৩টি অনুরোধ যাচাইয়ের অপেক্ষায় আছে। যাচাই শেষ হলে নতুন অনুরোধ দিন।" },
          { status: 429 },
        );
      }
      if (error.code === "P0002") return NextResponse.json({ error: "রেস্টুরেন্ট পাওয়া যায়নি" }, { status: 404 });
      console.error("submit_payment_request failed", error);
      return NextResponse.json({ error: "অনুরোধ জমা দেওয়া যায়নি" }, { status: 500 });
    }

    return NextResponse.json({ id: data as string, amount, periodDays }, { status: 201 });
  } catch (err) {
    console.error("payment-requests POST error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
