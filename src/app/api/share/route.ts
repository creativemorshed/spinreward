import { NextResponse } from "next/server";
import { clientIpHash } from "@/lib/ip";
import { enforceBurstLimit } from "@/lib/ratelimit";
import { getAdmin } from "@/lib/supabase-admin";
import { isValidSlug, isValidVisitorId } from "@/lib/validation";
import { ensureVisitor, findActiveRestaurantId, getBonusBalance } from "@/lib/visitors";
import type { ShareResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/share  { slug, visitorId }
 * শেয়ার বাটনে চাপ দিলে +১ বোনাস স্পিন — দিনে একবার (DB ফাংশনে atomic)।
 * দ্রষ্টব্য: Facebook আসলেই পোস্ট হয়েছে কিনা সার্ভার যাচাই করতে পারে না;
 * তাই বোনাস "শেয়ারে চাপ" ধরে দেওয়া হয় এবং দৈনিক সীমা দিয়ে অপব্যবহার সীমিত রাখা হয়।
 */
export async function POST(req: Request) {
  let body: { slug?: unknown; visitorId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "অবৈধ অনুরোধ" }, { status: 400 });
  }
  if (!isValidSlug(body.slug) || !isValidVisitorId(body.visitorId)) {
    return NextResponse.json({ error: "অবৈধ অনুরোধ" }, { status: 400 });
  }

  const limited = await enforceBurstLimit(req);
  if (limited) return limited;

  try {
    const admin = getAdmin();
    const restaurantId = await findActiveRestaurantId(admin, body.slug);
    if (!restaurantId) return NextResponse.json({ error: "রেস্টুরেন্ট পাওয়া যায়নি" }, { status: 404 });

    await ensureVisitor(admin, restaurantId, body.visitorId, null, clientIpHash(req));
    const { data: granted, error } = await admin.rpc("claim_share_bonus", {
      p_restaurant: restaurantId,
      p_visitor: body.visitorId,
    });
    if (error) throw error;

    const res: ShareResponse = {
      granted: granted === true,
      bonusSpins: await getBonusBalance(admin, restaurantId, body.visitorId),
    };
    return NextResponse.json(res, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("share route error", err);
    return NextResponse.json({ error: "সার্ভারে সমস্যা হয়েছে" }, { status: 500 });
  }
}
