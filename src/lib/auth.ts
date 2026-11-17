import "server-only";
import { getAdmin } from "./supabase-admin";
import type { Plan } from "./types";

export interface OwnedRestaurant {
  id: string;
  name: string;
  slug: string;
  plan: Plan;
  /** সেবার মেয়াদ (ISO) — মেয়াদ শেষ হলেও মালিক ড্যাশবোর্ডে ঢুকতে পারে, শুধু স্পিন-পেজ বন্ধ থাকে */
  serviceUntil: string;
}

/**
 * `Authorization: Bearer <access_token>` যাচাই করে ওই ইউজারের রেস্টুরেন্ট ফেরত দেয়।
 * টোকেন ভুল / রেস্টুরেন্ট না থাকলে null।
 */
export async function getOwnedRestaurant(req: Request): Promise<OwnedRestaurant | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;

  const admin = getAdmin();
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return null;

  const { data, error } = await admin
    .from("restaurants")
    .select("id, name, slug, plan, is_active, service_until")
    .eq("owner_id", userData.user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    plan: data.plan as Plan,
    serviceUntil: data.service_until as string,
  };
}
