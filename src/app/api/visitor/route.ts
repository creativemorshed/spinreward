import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/supabase-admin";
import { isValidSlug, isValidVisitorId } from "@/lib/validation";
import { ensureVisitor, findActiveRestaurantId, hasFreeSpinToday } from "@/lib/visitors";
import type { VisitorResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/visitor  { slug, visitorId, ref? }
 * পেজ লোডের সময় ডাকা হয়: ভিজিটর নিবন্ধন (+ শেয়ার-লিংকের ref থাকলে রেফারেল রেকর্ড),
 * এবং কতগুলো স্পিন বাকি তা জানায়।
 */
export async function POST(req: Request) {
  let body: { slug?: unknown; visitorId?: unknown; ref?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "অবৈধ অনুরোধ" }, { status: 400 });
  }
  if (!isValidSlug(body.slug) || !isValidVisitorId(body.visitorId)) {
    return NextResponse.json({ error: "অবৈধ অনুরোধ" }, { status: 400 });
  }

  try {
    const admin = getAdmin();
    const restaurantId = await findActiveRestaurantId(admin, body.slug);
    if (!restaurantId) return NextResponse.json({ error: "রেস্টুরেন্ট পাওয়া যায়নি" }, { status: 404 });

    const visitor = await ensureVisitor(
      admin,
      restaurantId,
      body.visitorId,
      typeof body.ref === "string" ? body.ref : null,
    );
    const freeSpinAvailable = await hasFreeSpinToday(admin, restaurantId, body.visitorId);

    const res: VisitorResponse = { refCode: visitor.refCode, bonusSpins: visitor.bonusSpins, freeSpinAvailable };
    return NextResponse.json(res, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("visitor route error", err);
    return NextResponse.json({ error: "সার্ভারে সমস্যা হয়েছে" }, { status: 500 });
  }
}
