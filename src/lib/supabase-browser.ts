"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** ব্রাউজারের ক্লায়েন্ট (anon key) — শুধু লগইন/সেশনের জন্য; ডেটা পড়া হয় API route দিয়ে। */
export function getBrowserClient(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL ও NEXT_PUBLIC_SUPABASE_ANON_KEY সেট করা নেই");
  }

  client = createClient(url, key);
  return client;
}
