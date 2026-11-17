import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { isPlan } from "@/lib/plans";
import { getAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PATCH /api/admin/restaurants/<id>  { plan?, is_active?, name? }
 * - is_active=false → রেস্টুরেন্ট স্থগিত (স্পিন-পেজ বন্ধ; মোছা হয় না, ডেটা ও পেমেন্ট থাকে)
 * - plan বদলানো মেয়াদ পরিবর্তন করে না; মেয়াদ বাড়ে শুধু পেমেন্ট রেকর্ড করলে
 */
export async function PATCH(req: Request, { params }: { params: Params }) {
  try {
    const check = await requireAdmin(req);
    if (!check.ok) return check.response;

    const { id } = await params;
    if (!UUID.test(id)) return NextResponse.json({ error: "অবৈধ id" }, { status: 400 });

    let body: { plan?: unknown; is_active?: unknown; name?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "অবৈধ অনুরোধ" }, { status: 400 });
    }

    const patch: Record<string, unknown> = {};
    if (body.plan !== undefined) {
      if (!isPlan(body.plan)) return NextResponse.json({ error: "অবৈধ প্ল্যান" }, { status: 400 });
      patch.plan = body.plan;
    }
    if (body.is_active !== undefined) {
      if (typeof body.is_active !== "boolean") return NextResponse.json({ error: "is_active true/false হতে হবে" }, { status: 400 });
      patch.is_active = body.is_active;
    }
    if (body.name !== undefined) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (name.length < 2 || name.length > 60) return NextResponse.json({ error: "নাম ২–৬০ অক্ষরের হতে হবে" }, { status: 400 });
      patch.name = name;
    }
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: "পরিবর্তনের কিছু নেই" }, { status: 400 });

    const { data, error } = await getAdmin()
      .from("restaurants")
      .update(patch)
      .eq("id", id)
      .select("id, name, slug, plan, is_active, service_until")
      .maybeSingle();

    if (error) {
      console.error("restaurant update failed", error);
      return NextResponse.json({ error: "আপডেট করা যায়নি" }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "রেস্টুরেন্ট পাওয়া যায়নি" }, { status: 404 });
    return NextResponse.json({ restaurant: data });
  } catch (err) {
    console.error("admin restaurant PATCH error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
