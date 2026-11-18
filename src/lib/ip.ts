import { createHash } from "node:crypto";
import { isIP } from "node:net";

/**
 * ক্লায়েন্টের IP বের করা ও গোপনীয়তা-বান্ধব হ্যাশ বানানো।
 *
 * হেডারের ক্রম: x-vercel-forwarded-for → x-real-ip → x-forwarded-for-এর প্রথমটি।
 * Vercel এই হেডারগুলো নিজে বসায় (ক্লায়েন্টের পাঠানো মান মুছে), তাই সেখানে নকল করা যায় না।
 * ⚠️ অন্য প্রক্সির পেছনে চালালে (নিজস্ব সার্ভার/nginx) ক্লায়েন্ট x-forwarded-for নকল করতে পারে —
 *    তখন প্রক্সিতে ওই হেডার overwrite করুন।
 */
export function getClientIp(req: Request): string | null {
  const h = req.headers;
  const candidates = [
    h.get("x-vercel-forwarded-for"),
    h.get("x-real-ip"),
    (h.get("x-forwarded-for") ?? "").split(",")[0],
  ];
  for (const raw of candidates) {
    const ip = (raw ?? "").trim();
    if (ip && isIP(ip)) return ip;
  }
  return null;
}

/** "::" সম্প্রসারণ করে ৮টি ১৬-বিট ব্লকে ভাঙা (বৈধ IPv6 ধরে নিয়ে; আগে isIP দিয়ে যাচাই করুন) */
function expandIPv6(ip: string): number[] {
  let addr = ip.split("%")[0]; // zone id (fe80::1%eth0) বাদ

  // শেষে dotted IPv4 থাকলে (::ffff:1.2.3.4 নয়, ২০০১:db8::1.2.3.4) দুটি hex ব্লকে রূপান্তর
  const v4 = addr.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number);
    addr = addr.replace(v4[0], `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`);
  }

  const [head, tail] = addr.split("::");
  const headParts = head ? head.split(":") : [];
  const tailParts = tail !== undefined && tail !== "" ? tail.split(":") : [];
  const missing = 8 - headParts.length - tailParts.length;
  const full = tail === undefined ? headParts : [...headParts, ...Array(Math.max(missing, 0)).fill("0"), ...tailParts];
  return full.map((p) => parseInt(p || "0", 16));
}

/**
 * তুলনার জন্য IP স্বাভাবিক করা:
 *  - IPv4-mapped IPv6 (::ffff:1.2.3.4) → সাধারণ IPv4
 *  - IPv6 → প্রথম ৬৪ বিট (/64)। মোবাইল ক্যারিয়ার একই ডিভাইসকে /64-এর ভেতরে ঘনঘন নতুন ঠিকানা দেয়,
 *    পুরো ঠিকানা ধরলে ইনকগনিটো ট্যাব খুলেই "ভিন্ন IP" হয়ে যেত।
 */
export function normalizeIp(ip: string): string {
  const kind = isIP(ip);
  if (kind === 4) return ip;
  if (kind !== 6) return ip;

  const blocks = expandIPv6(ip);
  // ::ffff:a.b.c.d
  if (blocks.slice(0, 5).every((b) => b === 0) && blocks[5] === 0xffff) {
    return `${blocks[6] >> 8}.${blocks[6] & 255}.${blocks[7] >> 8}.${blocks[7] & 255}`;
  }
  return blocks
    .slice(0, 4)
    .map((b) => b.toString(16))
    .join(":") + "::/64";
}

/** IP-র সল্টযুক্ত SHA-256 (৩২ হেক্স)। আসল IP কখনও ডাটাবেসে যায় না। */
export function hashIp(ip: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${normalizeIp(ip)}`).digest("hex").slice(0, 32);
}

export function getSalt(): string {
  return process.env.IP_HASH_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

/** অনুরোধের IP-র হ্যাশ; IP না পেলে null (তখন IP-ভিত্তিক সব পরীক্ষা বাদ — লোকাল ডেভের জন্য) */
export function clientIpHash(req: Request): string | null {
  const ip = getClientIp(req);
  return ip ? hashIp(ip, getSalt()) : null;
}
