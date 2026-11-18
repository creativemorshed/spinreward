import "server-only";
import { NextResponse } from "next/server";
import { clientIpHash } from "./ip";
import { LIMITS } from "./limits";
import { getAdmin } from "./supabase-admin";

/**
 * IP-ভিত্তিক burst সীমা। সীমা পেরোলে 429 NextResponse ফেরত দেয়, নইলে null।
 * ফেল-ওপেন: IP অজানা বা ডাটাবেস ত্রুটি হলে অনুরোধ আটকানো হয় না — বৈধ কাস্টমার যেন ভুগতে না হয়।
 */
export async function enforceBurstLimit(req: Request): Promise<NextResponse | null> {
  const ipHash = clientIpHash(req);
  if (!ipHash) return null;

  try {
    const { data, error } = await getAdmin().rpc("hit_rate_limit", {
      p_key: `burst:${ipHash}`,
      p_window_seconds: LIMITS.burstWindowSeconds,
      p_max: LIMITS.burstMax,
    });
    if (error) {
      console.error("hit_rate_limit failed (fail-open)", error);
      return null;
    }
    if (data === false) {
      return NextResponse.json(
        { error: "অনেক বেশি অনুরোধ হয়েছে, এক মিনিট পরে আবার চেষ্টা করুন", code: "RATE_LIMITED" },
        { status: 429, headers: { "Retry-After": String(LIMITS.burstWindowSeconds) } },
      );
    }
  } catch (err) {
    console.error("rate limit check error (fail-open)", err);
  }
  return null;
}
