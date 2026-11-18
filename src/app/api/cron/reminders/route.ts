import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { buildReminderEmail, isReminderKind, readEmailConfig, sendEmail, type DueReminder } from "@/lib/reminders";
import { getAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// প্রতি ইমেইলের মাঝে বিরতি থাকে (Resend-এর রেট-লিমিট), তাই ফাংশনকে বেশি সময় দিই
export const maxDuration = 60;

/** এক রানে সর্বোচ্চ কতগুলো ইমেইল (বাকিগুলো পরের দিনের রানে, তারা নিজ নিজ জানালার ভেতরেই থাকে) */
const MAX_PER_RUN = 80;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * GET /api/cron/reminders — প্রতিদিন একবার (vercel.json-এর cron; Vercel নিজে
 * `Authorization: Bearer $CRON_SECRET` পাঠায়)।
 *
 *  1) CRON_SECRET সেট না থাকলে 503 — কখনও অরক্ষিত খোলা থাকে না
 *  2) পুরনো rate-limit সারি পরিষ্কার
 *  3) যাদের ইমেইল বাকি (due_reminders) তাদের প্রত্যেকের জন্য: আগে "দখল" (claim) → পাঠানো →
 *     ব্যর্থ হলে দখল ছেড়ে দেওয়া (পরের রানে আবার চেষ্টা)। ফলে একই ইমেইল দুইবার যায় না।
 *  4) ইমেইল কনফিগার না থাকলে (RESEND_API_KEY/EMAIL_FROM) কিছুই পাঠায় না ও দখল করে না
 *
 * ?dry=1 — কী কী যেত শুধু তা দেখায়, পাঠায় না।
 */
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET সেট করা নেই" }, { status: 503 });
  }
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const admin = getAdmin();
    const dry = new URL(req.url).searchParams.get("dry") === "1";

    const { data: purged } = await admin.rpc("purge_rate_limits");

    const { data, error } = await admin.rpc("due_reminders");
    if (error) {
      console.error("due_reminders failed", error);
      return NextResponse.json({ error: "তালিকা আনা যায়নি" }, { status: 500 });
    }
    const due: DueReminder[] = ((data ?? []) as DueReminder[]).filter((r) => isReminderKind(r.kind));

    if (dry) {
      return NextResponse.json({ dry: true, purgedRateLimits: purged ?? 0, due: due.map((r) => ({ slug: r.slug, kind: r.kind })) });
    }

    const cfg = readEmailConfig();
    if (!cfg) {
      return NextResponse.json({
        ok: true,
        skipped: "ইমেইল কনফিগার করা নেই (RESEND_API_KEY ও EMAIL_FROM)",
        due: due.length,
        purgedRateLimits: purged ?? 0,
      });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
    const delay = Number.isInteger(Number(process.env.REMINDER_SEND_DELAY_MS)) ? Number(process.env.REMINDER_SEND_DELAY_MS) : 600;

    let sent = 0;
    let failed = 0;
    let skippedClaimed = 0;
    for (const r of due.slice(0, MAX_PER_RUN)) {
      const { data: claimed, error: claimError } = await admin.rpc("claim_reminder", {
        p_restaurant: r.restaurant_id,
        p_kind: r.kind,
        p_service_until: r.service_until,
      });
      if (claimError) {
        console.error("claim_reminder failed", claimError);
        failed++;
        continue;
      }
      if (claimed !== true) {
        skippedClaimed++; // অন্য একটি রান এটা এইমাত্র দখল করেছে
        continue;
      }

      const result = await sendEmail(cfg, r.owner_email, buildReminderEmail(r, siteUrl));
      if (result.ok) {
        sent++;
      } else {
        failed++;
        console.error(`reminder email failed for ${r.slug}/${r.kind}: ${result.error}`);
        await admin.rpc("release_reminder", {
          p_restaurant: r.restaurant_id,
          p_kind: r.kind,
          p_service_until: r.service_until,
        });
      }
      if (delay > 0) await sleep(delay);
    }

    return NextResponse.json({
      ok: true,
      due: due.length,
      sent,
      failed,
      skippedClaimed,
      deferred: Math.max(due.length - MAX_PER_RUN, 0),
      purgedRateLimits: purged ?? 0,
    });
  } catch (err) {
    console.error("reminders cron error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
