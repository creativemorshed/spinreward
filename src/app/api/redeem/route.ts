import { NextResponse } from "next/server";
import { getOwnedRestaurant } from "@/lib/auth";
import { isValidCouponCode, normalizeCouponCode } from "@/lib/rewards";
import { getAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/redeem  { code }
 * ক্যাশিয়ার (রেস্টুরেন্ট মালিক) কুপন যাচাই করে রিডিম করেন।
 * আপডেটে `status = 'active'` শর্ত থাকায় একই কুপন দুইবার রিডিম হওয়া অসম্ভব।
 */
export async function POST(req: Request) {
  try {
    const restaurant = await getOwnedRestaurant(req);
    if (!restaurant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let body: { code?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const code = normalizeCouponCode(typeof body.code === "string" ? body.code : "");
    if (!isValidCouponCode(code)) {
      return NextResponse.json({ error: "কুপন কোডটি সঠিক নয় (৮ অক্ষর)" }, { status: 400 });
    }

    const admin = getAdmin();
    const { data: coupon } = await admin
      .from("coupons")
      .select("id, status, discount_amount, expires_at")
      .eq("restaurant_id", restaurant.id)
      .eq("code", code)
      .maybeSingle();

    if (!coupon) return NextResponse.json({ error: "এই কোডে কোনো কুপন পাওয়া যায়নি" }, { status: 404 });
    if (coupon.status === "redeemed") {
      return NextResponse.json({ error: "এই কুপন আগেই ব্যবহার করা হয়েছে" }, { status: 409 });
    }
    if (new Date(coupon.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: "কুপনের মেয়াদ শেষ" }, { status: 410 });
    }

    const { data: updated, error } = await admin
      .from("coupons")
      .update({ status: "redeemed", redeemed_at: new Date().toISOString() })
      .eq("id", coupon.id)
      .eq("status", "active")
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("redeem failed", error);
      return NextResponse.json({ error: "রিডিম করা যায়নি" }, { status: 500 });
    }
    if (!updated) {
      // একই মুহূর্তে অন্য কেউ রিডিম করে ফেলেছে
      return NextResponse.json({ error: "এই কুপন আগেই ব্যবহার করা হয়েছে" }, { status: 409 });
    }

    return NextResponse.json({ ok: true, discountAmount: coupon.discount_amount });
  } catch (err) {
    console.error("redeem route error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
