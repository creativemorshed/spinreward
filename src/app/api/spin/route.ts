import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/supabase-admin";
import { generateCouponCode, pickWeightedIndex } from "@/lib/rewards";
import { isValidSlug, isValidVisitorId } from "@/lib/validation";
import { ensureVisitor, findActiveRestaurantId, getBonusBalance } from "@/lib/visitors";
import type { SpinResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COUPON_VALID_DAYS = 7;

function fail(message: string, status: number, code?: string) {
  return NextResponse.json({ error: message, code }, { status });
}

/**
 * POST /api/spin  { slug, visitorId, ref? }
 *
 * - রেজাল্ট সার্ভারে নির্ধারিত হয় (ক্লায়েন্ট কখনও reward বেছে নিতে পারে না)
 * - আগে দিনের ফ্রি স্পিন (DB unique index), না থাকলে বোনাস স্পিন (atomic ফাংশন)
 * - প্রথম স্পিনের পর, রেফারেল থাকলে রেফারার বোনাস পায় (দৈনিক সীমা DB ফাংশনে)
 */
export async function POST(req: Request) {
  let body: { slug?: unknown; visitorId?: unknown; ref?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("অবৈধ অনুরোধ", 400);
  }

  if (!isValidSlug(body.slug)) return fail("অবৈধ রেস্টুরেন্ট", 400);
  if (!isValidVisitorId(body.visitorId)) return fail("অবৈধ অনুরোধ", 400);
  const slug = body.slug;
  const visitorId = body.visitorId;

  try {
    const admin = getAdmin();

    const restaurantId = await findActiveRestaurantId(admin, slug);
    if (!restaurantId) return fail("রেস্টুরেন্ট পাওয়া যায়নি", 404);

    const { data: rewards, error: rewardsError } = await admin
      .from("rewards")
      .select("id, position, label, discount_amount, weight")
      .eq("restaurant_id", restaurantId)
      .order("position", { ascending: true });
    if (rewardsError || !rewards || rewards.length !== 8) {
      return fail("এই রেস্টুরেন্টের চাকা এখনও প্রস্তুত নয়", 409);
    }

    const index = pickWeightedIndex(
      rewards.map((r) => r.weight as number),
      randomInt,
    );
    if (index === null) return fail("এই রেস্টুরেন্টের চাকা এখনও প্রস্তুত নয়", 409);
    const reward = rewards[index];

    // ভিজিটর রেকর্ড (ও ref থাকলে রেফারেল সংযোগ) নিশ্চিত
    const visitor = await ensureVisitor(admin, restaurantId, visitorId, typeof body.ref === "string" ? body.ref : null);

    const insertSpin = (isBonus: boolean) =>
      admin
        .from("spins")
        .insert({ restaurant_id: restaurantId, reward_id: reward.id, visitor_id: visitorId, is_bonus: isBonus })
        .select("id")
        .single();

    // ১) ফ্রি স্পিন — unique (রেস্টুরেন্ট, ভিজিটর, দিন) ভাঙলে 23505
    let usedBonus = false;
    let spinId: string;
    const free = await insertSpin(false);

    if (!free.error) {
      spinId = free.data.id;
    } else if (free.error.code === "23505") {
      // ২) ফ্রি শেষ — বোনাস স্পিন খরচ করার চেষ্টা (atomic)
      const { data: consumed, error: consumeError } = await admin.rpc("consume_bonus_spin", {
        p_restaurant: restaurantId,
        p_visitor: visitorId,
      });
      if (consumeError) throw consumeError;
      if (consumed !== true) {
        return fail(
          "আজকের স্পিন শেষ! শেয়ার করে বোনাস স্পিন নিন, অথবা কাল আবার আসুন।",
          429,
          "NO_SPINS",
        );
      }

      const bonus = await insertSpin(true);
      if (bonus.error) {
        // স্পিন রেকর্ড হয়নি — বোনাস ফেরত দিই যাতে ব্যবহারকারী ঠকে না
        await admin.rpc("refund_bonus_spin", { p_restaurant: restaurantId, p_visitor: visitorId });
        console.error("bonus spin insert failed", bonus.error);
        return fail("কিছু একটা ভুল হয়েছে, আবার চেষ্টা করুন", 500);
      }
      usedBonus = true;
      spinId = bonus.data.id;
    } else {
      console.error("spin insert failed", free.error);
      return fail("কিছু একটা ভুল হয়েছে, আবার চেষ্টা করুন", 500);
    }

    // কুপন (জিতলে)
    let coupon: SpinResponse["coupon"] = null;
    if (reward.discount_amount > 0) {
      const expiresAt = new Date(Date.now() + COUPON_VALID_DAYS * 24 * 60 * 60 * 1000).toISOString();

      // কোড সংঘর্ষ (অত্যন্ত বিরল) হলে সর্বোচ্চ ৩ বার নতুন কোড চেষ্টা
      for (let attempt = 0; attempt < 3 && !coupon; attempt++) {
        const code = generateCouponCode(randomInt);
        const { error: couponError } = await admin.from("coupons").insert({
          restaurant_id: restaurantId,
          reward_id: reward.id,
          spin_id: spinId,
          code,
          discount_amount: reward.discount_amount,
          expires_at: expiresAt,
        });
        if (!couponError) {
          coupon = { code, discountAmount: reward.discount_amount, expiresAt };
        } else if (couponError.code !== "23505") {
          console.error("coupon insert failed", couponError);
          break;
        }
      }
      if (!coupon) return fail("কুপন তৈরি করা যায়নি, রেস্টুরেন্টের স্টাফকে জানান", 500);
    }

    // রেফারেল ক্রেডিট — ব্যর্থ হলেও ব্যবহারকারীর স্পিনে প্রভাব ফেলে না
    try {
      await admin.rpc("credit_referral", { p_restaurant: restaurantId, p_visitor: visitorId });
    } catch (e) {
      console.error("credit_referral failed", e);
    }

    const response: SpinResponse = {
      rewardIndex: index,
      reward: { label: reward.label, discountAmount: reward.discount_amount },
      coupon,
      usedBonus,
      bonusSpins: await getBonusBalance(admin, restaurantId, visitorId),
      refCode: visitor.refCode,
    };
    return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("spin route error", err);
    return fail("সার্ভারে সমস্যা হয়েছে", 500);
  }
}
