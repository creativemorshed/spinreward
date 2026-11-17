import "server-only";
import { NextResponse } from "next/server";
import { getAdmin } from "./supabase-admin";

export type AdminCheck = { ok: true; userId: string } | { ok: false; response: NextResponse };

/**
 * `Authorization: Bearer <token>` যাচাই করে এবং ইউজার `platform_admins` টেবিলে আছে কিনা দেখে।
 * প্রতিটি /api/admin/* রুটের প্রথম কাজ এটি ডাকা — না হলে সরাসরি `check.response` ফেরত দিন।
 *  - টোকেন নেই/ভুল → 401
 *  - ইউজার বৈধ কিন্তু অ্যাডমিন নন → 403
 */
export async function requireAdmin(req: Request): Promise<AdminCheck> {
  const deny = (status: 401 | 403) => ({
    ok: false as const,
    response: NextResponse.json({ error: status === 401 ? "Unauthorized" : "Forbidden" }, { status }),
  });

  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return deny(401);

  const admin = getAdmin();
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return deny(401);

  const { data: row, error } = await admin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (error) throw error;
  if (!row) return deny(403);

  return { ok: true, userId: userData.user.id };
}
