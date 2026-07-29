// src/lib/supabase.js
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ── Auth ──
export const signUp   = (e, p) => supabase.auth.signUp({ email: e, password: p });
export const signIn   = (e, p) => supabase.auth.signInWithPassword({ email: e, password: p });
export const signOut  = ()     => supabase.auth.signOut();
export const getSession = ()   => supabase.auth.getSession();

// ── Restaurant ──
export async function getRestaurantBySlug(slug) {
  const { data, error } = await supabase
    .from("restaurants")
    .select("*, wheel_configs(*)")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();
  return { data, error };
}

export async function getRestaurantByOwner(userId) {
  const { data, error } = await supabase
    .from("restaurants")
    .select("*, wheel_configs(*)")
    .eq("owner_id", userId)
    .single();
  return { data, error };
}

export async function updateWheelConfig(restaurantId, config) {
  const { data, error } = await supabase
    .from("wheel_configs")
    .upsert({ restaurant_id: restaurantId, ...config, updated_at: new Date().toISOString() });
  return { data, error };
}

// ── Spin Session ──
export function generateToken() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function generateCoupon(restaurantSlug, discount) {
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${restaurantSlug.slice(0,4).toUpperCase()}-${discount}-${rand}`;
}

export async function createSpinSession(restaurantId, restaurantSlug, finalDiscount, spinsCount) {
  const token  = generateToken();
  const coupon = generateCoupon(restaurantSlug, finalDiscount);
  const { data, error } = await supabase
    .from("spin_sessions")
    .insert({
      restaurant_id:  restaurantId,
      session_token:  token,
      final_discount: finalDiscount,
      spins_count:    spinsCount,
      coupon_code:    coupon,
    })
    .select()
    .single();
  return { data, error };
}

export async function redeemCoupon(couponCode) {
  const { data, error } = await supabase
    .from("spin_sessions")
    .update({ is_redeemed: true, redeemed_at: new Date().toISOString() })
    .eq("coupon_code", couponCode)
    .eq("is_redeemed", false)
    .select()
    .single();
  return { data, error };
}

export async function getCouponInfo(couponCode) {
  const { data, error } = await supabase
    .from("spin_sessions")
    .select("*, restaurants(name, slug)")
    .eq("coupon_code", couponCode)
    .single();
  return { data, error };
}

export async function markFacebookShared(sessionId) {
  await supabase
    .from("spin_sessions")
    .update({ facebook_shared: true, shared_at: new Date().toISOString() })
    .eq("id", sessionId);
}

// ── Analytics ──
export async function getAnalytics(restaurantId) {
  const { data } = await supabase
    .from("spin_sessions")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false });
  return data || [];
}

export async function getAnalyticsSummary(restaurantId) {
  const sessions = await getAnalytics(restaurantId);
  const today    = new Date().toDateString();
  return {
    totalSpins:      sessions.length,
    totalRedeemed:   sessions.filter(s => s.is_redeemed).length,
    totalShared:     sessions.filter(s => s.facebook_shared).length,
    totalDiscount:   sessions.reduce((s, r) => s + (r.final_discount || 0), 0),
    todaySpins:      sessions.filter(s => new Date(s.created_at).toDateString() === today).length,
    todayRedeemed:   sessions.filter(s => s.is_redeemed && new Date(s.redeemed_at).toDateString() === today).length,
    sessions,
  };
}
