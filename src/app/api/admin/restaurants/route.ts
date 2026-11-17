import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin-auth";
import { isPlan, isValidEmail } from "@/lib/plans";
import { getAdmin } from "@/lib/supabase-admin";
import { isValidSlug } from "@/lib/validation";
import type { AdminRestaurant } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 0/O, 1/l/I বাদ — ফোনে/মুখে বলতে সুবিধা
const PASSWORD_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

function generateTempPassword(length = 12): string {
  let out = "";
  for (let i = 0; i < length; i++) out += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
  return out;
}

/** Supabase Auth-এ ইমেইল দিয়ে ইউজার খোঁজা (পেজ ধরে, সর্বোচ্চ ২০০০ ইউজার) */
async function findUserIdByEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return hit.id;
    if (data.users.length < 200) break;
  }
  return null;
}

/** GET /api/admin/restaurants — সব রেস্টুরেন্ট (মালিকের ইমেইল, স্পিন, পেমেন্ট সংখ্যা সহ) */
export async function GET(req: Request) {
  try {
    const check = await requireAdmin(req);
    if (!check.ok) return check.response;

    const { data, error } = await getAdmin().rpc("admin_restaurants");
    if (error) {
      console.error("admin_restaurants failed", error);
      return NextResponse.json({ error: "তালিকা লোড করা যায়নি" }, { status: 500 });
    }
    return NextResponse.json({ restaurants: (data ?? []) as AdminRestaurant[] }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("admin restaurants GET error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * POST /api/admin/restaurants  { name, slug, plan, ownerEmail }
 * - মালিকের ইউজার না থাকলে তৈরি হয় এবং একটি অস্থায়ী পাসওয়ার্ড **একবারই** ফেরত আসে
 * - ইউজার আগে থেকে থাকলে তাকেই মালিক করা হয় (পাসওয়ার্ড বদলায় না)
 * - ৮টি ডিফল্ট reward ও ১৪ দিনের ট্রায়াল ডাটাবেস নিজেই বসায়
 */
export async function POST(req: Request) {
  try {
    const check = await requireAdmin(req);
    if (!check.ok) return check.response;

    let body: { name?: unknown; slug?: unknown; plan?: unknown; ownerEmail?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "অবৈধ অনুরোধ" }, { status: 400 });
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
    const ownerEmail = typeof body.ownerEmail === "string" ? body.ownerEmail.trim().toLowerCase() : "";

    if (name.length < 2 || name.length > 60) {
      return NextResponse.json({ error: "নাম ২–৬০ অক্ষরের হতে হবে" }, { status: 400 });
    }
    if (!isValidSlug(slug)) {
      return NextResponse.json({ error: "slug: ৩–৪০ অক্ষর, শুধু a-z, 0-9 ও হাইফেন" }, { status: 400 });
    }
    if (!isPlan(body.plan)) return NextResponse.json({ error: "অবৈধ প্ল্যান" }, { status: 400 });
    if (!isValidEmail(ownerEmail)) return NextResponse.json({ error: "মালিকের ইমেইল সঠিক নয়" }, { status: 400 });

    const admin = getAdmin();

    const { data: slugTaken } = await admin.from("restaurants").select("id").eq("slug", slug).maybeSingle();
    if (slugTaken) return NextResponse.json({ error: "এই slug আগেই ব্যবহৃত হয়েছে" }, { status: 409 });

    // মালিক ইউজার: নতুন বানানো, না পারলে (আগে থেকে আছে) খুঁজে নেওয়া
    let ownerId: string | null = null;
    let tempPassword: string | null = null;
    let createdNewUser = false;

    const password = generateTempPassword();
    const created = await admin.auth.admin.createUser({ email: ownerEmail, password, email_confirm: true });
    if (!created.error && created.data.user) {
      ownerId = created.data.user.id;
      tempPassword = password;
      createdNewUser = true;
    } else {
      ownerId = await findUserIdByEmail(admin, ownerEmail);
      if (!ownerId) {
        console.error("createUser failed", created.error);
        return NextResponse.json({ error: "মালিকের অ্যাকাউন্ট তৈরি করা যায়নি" }, { status: 500 });
      }
    }

    // এক মালিক = এক রেস্টুরেন্ট (ড্যাশবোর্ড প্রথমটিই দেখায়)
    if (!createdNewUser) {
      const { data: already } = await admin.from("restaurants").select("id").eq("owner_id", ownerId).limit(1).maybeSingle();
      if (already) {
        return NextResponse.json({ error: "এই ইমেইল আগেই অন্য একটি রেস্টুরেন্টের মালিক" }, { status: 409 });
      }
    }

    const { data: restaurant, error: insertError } = await admin
      .from("restaurants")
      .insert({ owner_id: ownerId, name, slug, plan: body.plan })
      .select("id, name, slug, plan, service_until")
      .single();

    if (insertError) {
      // নতুন বানানো ইউজার অনাথ থেকে যাবে — মুছে ফেলি
      if (createdNewUser && ownerId) await admin.auth.admin.deleteUser(ownerId);
      if (insertError.code === "23505") {
        return NextResponse.json({ error: "এই slug আগেই ব্যবহৃত হয়েছে" }, { status: 409 });
      }
      console.error("restaurant insert failed", insertError);
      return NextResponse.json({ error: "রেস্টুরেন্ট তৈরি করা যায়নি" }, { status: 500 });
    }

    return NextResponse.json({ restaurant, ownerEmail, tempPassword }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("admin restaurants POST error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
