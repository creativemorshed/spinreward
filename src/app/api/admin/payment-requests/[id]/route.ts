import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/admin/payment-requests/<id>  { action: "approve" | "reject", note? }
 * অনুমোদনে খাতায় পেমেন্ট এন্ট্রি + মেয়াদ বৃদ্ধি + প্ল্যান বদল — একটিই ডাটাবেস-ট্রানজেকশনে।
 * বাতিলে কিছুই বদলায় না; কারণ (note) মালিক ড্যাশবোর্ডে দেখেন।
 */
export async function POST(req: Request, { params }: { params: Params }) {
  try {
    const check = await requireAdmin(req);
    if (!check.ok) return check.response;

    const { id } = await params;
    if (!UUID.test(id)) return NextResponse.json({ error: "অবৈধ id" }, { status: 400 });

    let body: { action?: unknown; note?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "অবৈধ অনুরোধ" }, { status: 400 });
    }
    if (body.action !== "approve" && body.action !== "reject") {
      return NextResponse.json({ error: "action approve বা reject হতে হবে" }, { status: 400 });
    }
    const note = typeof body.note === "string" ? body.note.trim() : "";
    if (note.length > 300) return NextResponse.json({ error: "নোট সর্বোচ্চ ৩০০ অক্ষর" }, { status: 400 });
    if (body.action === "reject" && note.length === 0) {
      return NextResponse.json({ error: "বাতিলের কারণ লিখুন (মালিক এটা দেখবেন)" }, { status: 400 });
    }

    const { data, error } = await getAdmin().rpc("review_payment_request", {
      p_request: id,
      p_admin: check.userId,
      p_approve: body.action === "approve",
      p_admin_note: note || null,
    });

    if (error) {
      if (error.code === "P0002") return NextResponse.json({ error: "অনুরোধ পাওয়া যায়নি" }, { status: 404 });
      if (error.code === "P0003") return NextResponse.json({ error: "এই অনুরোধ আগেই যাচাই করা হয়েছে" }, { status: 409 });
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "এই TrxID ইতিমধ্যে পেমেন্টের খাতায় আছে। অনুরোধটি বাতিল করুন (কারণ: আগেই রেকর্ড করা)।" },
          { status: 409 },
        );
      }
      console.error("review_payment_request failed", error);
      return NextResponse.json({ error: "যাচাই সম্পন্ন করা যায়নি" }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("admin payment-requests POST error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
