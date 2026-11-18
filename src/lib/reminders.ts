/**
 * মেয়াদ-রিমাইন্ডার ইমেইলের টেমপ্লেট (pure — কোনো নেটওয়ার্ক/DB নেই, তাই সহজে টেস্ট হয়)।
 * কখন কোন ধরন পাঠাতে হবে তা ডাটাবেসের `due_reminders()` ঠিক করে; এখানে শুধু লেখা বানানো হয়।
 */

export type ReminderKind = "d7" | "d3" | "d1" | "expired";

export interface DueReminder {
  restaurant_id: string;
  name: string;
  slug: string;
  owner_email: string;
  service_until: string;
  kind: ReminderKind;
}

export interface ReminderEmail {
  subject: string;
  html: string;
  text: string;
}

const KINDS: readonly string[] = ["d7", "d3", "d1", "expired"];
export const isReminderKind = (v: unknown): v is ReminderKind => typeof v === "string" && KINDS.includes(v);

/** HTML-এ বসানো সব ব্যবহারকারী-ডেটা (রেস্টুরেন্টের নাম) escape করা — ইনজেকশন ঠেকাতে */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** ঢাকার সময়ে তারিখ, বাংলায় */
export function formatDhakaDate(iso: string): string {
  return new Date(iso).toLocaleDateString("bn-BD", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Dhaka",
  });
}

const HEADLINE: Record<ReminderKind, (date: string) => string> = {
  d7: (d) => `আপনার সাবস্ক্রিপশনের মেয়াদ ৭ দিনের মধ্যে (${d}) শেষ হবে`,
  d3: (d) => `আপনার সাবস্ক্রিপশনের মেয়াদ ৩ দিনের মধ্যে (${d}) শেষ হবে`,
  d1: (d) => `আপনার সাবস্ক্রিপশনের মেয়াদ আগামী ২৪ ঘণ্টায় (${d}) শেষ হবে`,
  expired: (d) => `আপনার সাবস্ক্রিপশনের মেয়াদ শেষ হয়েছে (${d})`,
};

const CONSEQUENCE: Record<ReminderKind, string> = {
  d7: "মেয়াদ শেষ হলে কাস্টমারদের স্পিন পেজ বন্ধ হয়ে যাবে। এখনই নবায়ন করলে কোনো বিরতি ছাড়াই চলবে।",
  d3: "মেয়াদ শেষ হলে কাস্টমারদের স্পিন পেজ বন্ধ হয়ে যাবে। দেরি না করে নবায়ন করে নিন।",
  d1: "আগামীকালই কাস্টমারদের স্পিন পেজ বন্ধ হয়ে যেতে পারে। আজই নবায়ন করুন।",
  expired: "কাস্টমারদের স্পিন পেজ এখন বন্ধ আছে। নবায়ন করলেই আবার চালু হবে।",
};

const SUBJECT: Record<ReminderKind, (name: string) => string> = {
  d7: (n) => `${n}: সাবস্ক্রিপশনের মেয়াদ ৭ দিনের মধ্যে শেষ হবে`,
  d3: (n) => `${n}: সাবস্ক্রিপশনের মেয়াদ ৩ দিনের মধ্যে শেষ হবে`,
  d1: (n) => `⏳ ${n}: সাবস্ক্রিপশন আগামীকাল শেষ হচ্ছে`,
  expired: (n) => `⛔ ${n}: সাবস্ক্রিপশনের মেয়াদ শেষ — স্পিন পেজ বন্ধ`,
};

export function buildReminderEmail(r: DueReminder, siteUrl: string): ReminderEmail {
  const date = formatDhakaDate(r.service_until);
  const dashboard = `${siteUrl.replace(/\/+$/, "")}/dashboard`;
  const headline = HEADLINE[r.kind](date);
  const consequence = CONSEQUENCE[r.kind];
  const how = "ড্যাশবোর্ডে গিয়ে “সাবস্ক্রিপশন নবায়ন” অংশে টাকা পাঠানোর TrxID জমা দিন। যাচাই শেষে মেয়াদ বাড়িয়ে দেওয়া হবে।";

  const safeName = escapeHtml(r.name);
  const html = `<!doctype html>
<html lang="bn"><body style="margin:0;padding:24px;background:#fff7ed;font-family:'Hind Siliguri','Noto Sans Bengali',Arial,sans-serif;color:#0f172a">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px;border:1px solid #fed7aa">
    <p style="margin:0 0 4px;font-size:13px;color:#c2410c;font-weight:700">🎡 SpinReward</p>
    <h1 style="margin:0 0 12px;font-size:20px;line-height:1.4">${escapeHtml(headline)}</h1>
    <p style="margin:0 0 8px;color:#475569">রেস্টুরেন্ট: <b>${safeName}</b></p>
    <p style="margin:0 0 16px;color:#475569">${escapeHtml(consequence)}</p>
    <p style="margin:0 0 20px;color:#475569">${escapeHtml(how)}</p>
    <a href="${escapeHtml(dashboard)}" style="display:inline-block;background:#f97316;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px">ড্যাশবোর্ড খুলুন</a>
    <p style="margin:24px 0 0;font-size:12px;color:#94a3b8">এই ইমেইলটি স্বয়ংক্রিয়ভাবে পাঠানো হয়েছে। ইতিমধ্যে নবায়ন করে থাকলে উপেক্ষা করুন।</p>
  </div>
</body></html>`;

  const text = [headline, "", `রেস্টুরেন্ট: ${r.name}`, consequence, how, "", `ড্যাশবোর্ড: ${dashboard}`].join("\n");

  return { subject: SUBJECT[r.kind](r.name), html, text };
}

/** Resend-এর HTTP API (https://resend.com/docs/api-reference/emails/send-email) */
export interface EmailConfig {
  apiKey: string;
  from: string;
  /** পরীক্ষার জন্য বদলানো যায়; ডিফল্ট আসল Resend */
  apiUrl: string;
}

export function readEmailConfig(env: Record<string, string | undefined> = process.env): EmailConfig | null {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();
  if (!apiKey || !from) return null;
  return { apiKey, from, apiUrl: env.RESEND_API_URL?.trim() || "https://api.resend.com/emails" };
}

export type SendResult = { ok: true } | { ok: false; error: string };

export async function sendEmail(cfg: EmailConfig, to: string, mail: ReminderEmail): Promise<SendResult> {
  try {
    const res = await fetch(cfg.apiUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: cfg.from, to: [to], subject: mail.subject, html: mail.html, text: mail.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { ok: true };
    const body = await res.text().catch(() => "");
    return { ok: false, error: `HTTP ${res.status} ${body.slice(0, 200)}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unknown error" };
  }
}
