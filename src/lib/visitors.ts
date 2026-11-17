import "server-only";
import { randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateRefCode, isValidRefCode } from "./rewards";
import { todayInDhaka } from "./validation";

export interface VisitorState {
  refCode: string;
  bonusSpins: number;
  /** এই কলেই ভিজিটর প্রথমবার তৈরি হলো */
  isNew: boolean;
}

async function fetchVisitor(admin: SupabaseClient, restaurantId: string, visitorId: string) {
  const { data, error } = await admin
    .from("visitors")
    .select("ref_code, bonus_spins")
    .eq("restaurant_id", restaurantId)
    .eq("visitor_id", visitorId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * ভিজিটরের রেকর্ড নিশ্চিত করে (না থাকলে বানায়)।
 * `referrerRefCode` শুধু নতুন ভিজিটরের ক্ষেত্রে গণ্য হয়, এবং:
 *  - কোডটি এই রেস্টুরেন্টেরই কোনো ভিজিটরের হতে হবে
 *  - নিজের কোড হলে বাতিল (self-referral নয়)
 *  - আগে স্পিন করে থাকলে (অর্থাৎ আসলে "নতুন" নয়) বাতিল
 * রেফারারের বোনাস এখানে নয়, প্রথম স্পিনের পরে `credit_referral` দেয়।
 */
export async function ensureVisitor(
  admin: SupabaseClient,
  restaurantId: string,
  visitorId: string,
  referrerRefCode?: string | null,
): Promise<VisitorState> {
  const existing = await fetchVisitor(admin, restaurantId, visitorId);
  if (existing) return { refCode: existing.ref_code, bonusSpins: existing.bonus_spins, isNew: false };

  let referredBy: string | null = null;
  if (referrerRefCode && isValidRefCode(referrerRefCode)) {
    const { data: referrer } = await admin
      .from("visitors")
      .select("visitor_id")
      .eq("restaurant_id", restaurantId)
      .eq("ref_code", referrerRefCode)
      .maybeSingle();

    if (referrer && referrer.visitor_id !== visitorId) {
      const { count } = await admin
        .from("spins")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", restaurantId)
        .eq("visitor_id", visitorId);
      if (!count) referredBy = referrer.visitor_id;
    }
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await admin
      .from("visitors")
      .insert({
        restaurant_id: restaurantId,
        visitor_id: visitorId,
        ref_code: generateRefCode(randomInt),
        referred_by_visitor: referredBy,
      })
      .select("ref_code, bonus_spins")
      .single();

    if (!error) return { refCode: data.ref_code, bonusSpins: data.bonus_spins, isNew: true };

    if (error.code === "23505") {
      // হয় একই সময়ে অন্য রিকোয়েস্ট ভিজিটর বানিয়ে ফেলেছে, নয় ref_code সংঘর্ষ (অতি বিরল)
      const again = await fetchVisitor(admin, restaurantId, visitorId);
      if (again) return { refCode: again.ref_code, bonusSpins: again.bonus_spins, isNew: false };
      continue;
    }
    throw error;
  }
  throw new Error("ভিজিটর রেকর্ড তৈরি করা যায়নি");
}

/** আজ (ঢাকার সময়ে) এই ভিজিটরের ফ্রি স্পিন বাকি আছে কি? */
export async function hasFreeSpinToday(
  admin: SupabaseClient,
  restaurantId: string,
  visitorId: string,
): Promise<boolean> {
  const { count, error } = await admin
    .from("spins")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", restaurantId)
    .eq("visitor_id", visitorId)
    .eq("is_bonus", false)
    .eq("spin_day", todayInDhaka());
  if (error) throw error;
  return (count ?? 0) === 0;
}

export async function getBonusBalance(admin: SupabaseClient, restaurantId: string, visitorId: string): Promise<number> {
  const row = await fetchVisitor(admin, restaurantId, visitorId);
  return row?.bonus_spins ?? 0;
}

/**
 * slug থেকে সেবা-চালু রেস্টুরেন্টের id।
 * স্থগিত (is_active=false) বা মেয়াদ-উত্তীর্ণ (service_until ≤ এখন) হলে null —
 * ফলে spin/visitor/share সব API একসাথে বন্ধ হয়ে যায়।
 */
export async function findActiveRestaurantId(admin: SupabaseClient, slug: string): Promise<string | null> {
  const { data } = await admin
    .from("restaurants")
    .select("id")
    .eq("slug", slug)
    .eq("is_active", true)
    .gt("service_until", new Date().toISOString())
    .maybeSingle();
  return data?.id ?? null;
}
