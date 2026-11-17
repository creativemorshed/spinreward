import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * Service-role ক্লায়েন্ট — RLS পাশ কাটায়, তাই শুধু সার্ভারে (API route / server component) ব্যবহার করুন।
 * Lazy তৈরি হয় যাতে env ছাড়াও `next build` পাস করে।
 */
export function getAdmin(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL ও SUPABASE_SERVICE_ROLE_KEY সেট করা নেই");
  }

  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}
