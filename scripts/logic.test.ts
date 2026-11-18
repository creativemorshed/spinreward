import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import {
  generateCouponCode,
  generateRefCode,
  isValidCouponCode,
  isValidRefCode,
  normalizeCouponCode,
  pickWeightedIndex,
} from "../src/lib/rewards";
import { isValidSlug, isValidVisitorId, todayInDhaka } from "../src/lib/validation";
import { clientIpHash, getClientIp, hashIp, normalizeIp } from "../src/lib/ip";
import { LIMITS } from "../src/lib/limits";
import { buildReminderEmail, escapeHtml, isReminderKind, readEmailConfig, type DueReminder } from "../src/lib/reminders";
import {
  daysLeft,
  isRenewalMonths,
  isRequestMethod,
  renewalQuote,
  isPaymentMethod,
  isPlan,
  isValidEmail,
  monthlyRecurringRevenue,
  subscriptionState,
} from "../src/lib/plans";
import { SEGMENTS, segmentUnderPointer, targetRotation } from "../src/lib/wheel";

// 1) চাকা সবসময় ঠিক segment-এ থামে (যেকোনো শুরুর কোণ ও jitter-এ)
for (let start = 0; start < 5000; start += 137) {
  for (let index = 0; index < SEGMENTS; index++) {
    for (const jitter of [-0.5, -0.35, -0.1, 0, 0.2, 0.35, 0.5]) {
      const target = targetRotation(start, index, jitter);
      assert.ok(target > start + 360 * 5, "কমপক্ষে ৫ পাক ঘুরবে");
      assert.equal(segmentUnderPointer(target), index, `start=${start} index=${index} jitter=${jitter}`);
    }
  }
}
console.log("✓ wheel landing: সব সংমিশ্রণে সঠিক segment");

// 2) weighted random — ডিস্ট্রিবিউশন weight-এর কাছাকাছি
const weights = [15, 20, 8, 18, 2, 12, 15, 10];
const N = 200_000;
const counts = new Array(weights.length).fill(0);
for (let i = 0; i < N; i++) {
  const idx = pickWeightedIndex(weights, randomInt);
  assert.notEqual(idx, null);
  counts[idx as number]++;
}
const total = weights.reduce((a, b) => a + b, 0);
weights.forEach((w, i) => {
  const expected = w / total;
  const actual = counts[i] / N;
  assert.ok(Math.abs(actual - expected) < 0.01, `segment ${i}: expected ${expected}, got ${actual}`);
});
console.log("✓ weighted random: ডিস্ট্রিবিউশন weight মেনে চলে");

// 3) ধার কেস
assert.equal(pickWeightedIndex([0, 0, 0], randomInt), null);
assert.equal(pickWeightedIndex([], randomInt), null);
assert.equal(pickWeightedIndex([0, 5, 0], randomInt), 1);
assert.equal(pickWeightedIndex([-3, 5], randomInt), 1); // ঋণাত্মক weight ০ ধরা হয়
console.log("✓ weighted random: ধার কেস");

// 4) কুপন কোড
const codes = new Set<string>();
for (let i = 0; i < 5000; i++) {
  const c = generateCouponCode(randomInt);
  assert.ok(isValidCouponCode(c), c);
  codes.add(c);
}
assert.equal(codes.size, 5000, "৫০০০ কোডে কোনো সংঘর্ষ নেই");
assert.equal(normalizeCouponCode(" ab-cd 23 45 "), "ABCD2345");
assert.equal(isValidCouponCode("ABCD0123"), false); // 0 ও 1 নিষিদ্ধ
assert.equal(isValidCouponCode("ABCDEFG"), false); // ৭ অক্ষর
console.log("✓ coupon code: বৈধ, অনন্য, স্বাভাবিকীকরণ ঠিক");

// 5) রেফারেল কোড ও তারিখ
const refs = new Set<string>();
for (let i = 0; i < 5000; i++) {
  const r = generateRefCode(randomInt);
  assert.ok(isValidRefCode(r), r);
  assert.equal(r, r.toLowerCase());
  refs.add(r);
}
assert.equal(refs.size, 5000);
assert.equal(isValidRefCode("ABCDEFGHJK"), false); // বড় হাতের নয়
assert.equal(isValidRefCode("abcdefghij"), false); // i নিষিদ্ধ
assert.equal(isValidRefCode("abc"), false);
// ঢাকা UTC+6: UTC ১৮:৩০ = ঢাকায় পরের দিন ০০:৩০
assert.equal(todayInDhaka(new Date("2026-11-17T18:30:00Z")), "2026-11-18");
assert.equal(todayInDhaka(new Date("2026-11-17T17:59:00Z")), "2026-11-17");
assert.equal(isValidSlug("sampan"), true);
assert.equal(isValidSlug("Bad Slug"), false);
assert.equal(isValidVisitorId("short"), false);
console.log("✓ ref code, ঢাকার তারিখ, ইনপুট যাচাই");

// 6) প্ল্যান, সাবস্ক্রিপশন অবস্থা, MRR
const NOW = new Date("2026-11-17T06:00:00Z");
const inDays = (d: number) => new Date(NOW.getTime() + d * 86_400_000).toISOString();
const sub = (is_active: boolean, days: number, payments_count: number) =>
  subscriptionState({ is_active, service_until: inDays(days), payments_count }, NOW);

assert.equal(sub(true, 10, 0), "trial");
assert.equal(sub(true, 3, 0), "trial", "ট্রায়ালে শেষের দিকেও 'trial'");
assert.equal(sub(true, 30, 2), "active");
assert.equal(sub(true, 7, 2), "expiring");
assert.equal(sub(true, 7.01, 2), "active");
assert.equal(sub(true, 0, 2), "expired", "মেয়াদ ঠিক এখনই শেষ = expired");
assert.equal(sub(true, -5, 0), "expired");
assert.equal(sub(false, 30, 3), "suspended", "স্থগিত সবার উপরে");
assert.equal(sub(false, -5, 0), "suspended");
assert.equal(daysLeft(inDays(10), NOW), 10);
assert.equal(daysLeft(inDays(0.2), NOW), 1, "ভগ্নাংশ দিন উপরে গোল");
assert.ok(daysLeft(inDays(-3), NOW) <= 0);
assert.equal(monthlyRecurringRevenue({ basic: 2, standard: 1, premium: 3 }), 2 * 499 + 999 + 3 * 1999);
assert.equal(monthlyRecurringRevenue({ basic: 0, standard: 0, premium: 0 }), 0);
assert.equal(isValidEmail("owner@example.com"), true);
assert.equal(isValidEmail("a b@example.com"), false);
assert.equal(isValidEmail("no-at-sign"), false);
assert.equal(isValidEmail("a@b"), false);
assert.equal(isPlan("standard"), true);
assert.equal(isPlan("gold"), false);
assert.equal(isPaymentMethod("bkash"), true);
assert.equal(isPaymentMethod("paypal"), false);
console.log("✓ plans: সাবস্ক্রিপশন অবস্থা, বাকি দিন, MRR, ইনপুট যাচাই");

// 7) IP: হেডার, স্বাভাবিকীকরণ, হ্যাশ
const reqWith = (h: Record<string, string>) => new Request("http://x.test/", { headers: h });
assert.equal(getClientIp(reqWith({ "x-vercel-forwarded-for": "203.0.113.5", "x-forwarded-for": "9.9.9.9" })), "203.0.113.5", "Vercel হেডার আগে");
assert.equal(getClientIp(reqWith({ "x-real-ip": "198.51.100.7", "x-forwarded-for": "9.9.9.9" })), "198.51.100.7");
assert.equal(getClientIp(reqWith({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" })), "9.9.9.9", "প্রথমটি");
assert.equal(getClientIp(reqWith({ "x-forwarded-for": "not-an-ip" })), null, "অবৈধ IP বাদ");
assert.equal(getClientIp(reqWith({ "x-vercel-forwarded-for": "junk", "x-real-ip": "198.51.100.7" })), "198.51.100.7", "অবৈধ হলে পরেরটি");
assert.equal(getClientIp(reqWith({})), null);

assert.equal(normalizeIp("203.0.113.5"), "203.0.113.5");
assert.equal(normalizeIp("::ffff:203.0.113.5"), "203.0.113.5", "IPv4-mapped IPv6");
assert.equal(
  normalizeIp("2001:db8:abcd:12::1"),
  normalizeIp("2001:0db8:abcd:0012:ffff:ffff:ffff:ffff"),
  "একই /64 = একই (মোবাইল ক্যারিয়ারের ঠিকানা ঘোরানো)",
);
assert.notEqual(normalizeIp("2001:db8:abcd:12::1"), normalizeIp("2001:db8:abcd:13::1"), "ভিন্ন /64 আলাদা");
assert.equal(normalizeIp("2001:db8::1"), normalizeIp("2001:0db8:0:0:0:0:0:1"), "সংক্ষিপ্ত রূপ = পূর্ণ রূপ");
assert.equal(normalizeIp("::1"), normalizeIp("0:0:0:0:0:0:0:1"));
assert.equal(normalizeIp("fe80::1%eth0"), normalizeIp("fe80::1"), "zone id বাদ");

const h1 = hashIp("203.0.113.5", "salt-a");
assert.match(h1, /^[0-9a-f]{32}$/);
assert.equal(h1, hashIp("203.0.113.5", "salt-a"), "নির্ধারিত");
assert.notEqual(h1, hashIp("203.0.113.5", "salt-b"), "সল্ট ভিন্ন হলে হ্যাশ ভিন্ন");
assert.notEqual(h1, hashIp("203.0.113.6", "salt-a"));
assert.ok(!h1.includes("203"), "হ্যাশে আসল IP নেই");
assert.equal(hashIp("::ffff:203.0.113.5", "salt-a"), h1, "mapped IPv4 = সাধারণ IPv4");

// IP পাওয়া না গেলে (লোকাল/অজানা প্রক্সি) হ্যাশ null — তখন IP-ভিত্তিক সব পরীক্ষা বাদ পড়ে
assert.equal(clientIpHash(reqWith({})), null);
assert.equal(clientIpHash(reqWith({ "x-forwarded-for": "junk" })), null);
process.env.IP_HASH_SALT = "unit-salt";
assert.equal(clientIpHash(reqWith({ "x-forwarded-for": "203.0.113.5" })), hashIp("203.0.113.5", "unit-salt"), "env সল্ট ব্যবহৃত");
delete process.env.IP_HASH_SALT;

// LIMITS — env ওভাররাইড ও অবৈধ মানে ডিফল্ট
const saved = process.env.MAX_SPINS_PER_IP_PER_DAY;
delete process.env.MAX_SPINS_PER_IP_PER_DAY;
assert.equal(LIMITS.spinsPerIpPerDay, 100);
process.env.MAX_SPINS_PER_IP_PER_DAY = "250";
assert.equal(LIMITS.spinsPerIpPerDay, 250);
for (const bad of ["abc", "2", "-5", "1.5", "99999999"]) {
  process.env.MAX_SPINS_PER_IP_PER_DAY = bad;
  assert.equal(LIMITS.spinsPerIpPerDay, 100, `অবৈধ "${bad}" → ডিফল্ট`);
}
if (saved === undefined) delete process.env.MAX_SPINS_PER_IP_PER_DAY;
else process.env.MAX_SPINS_PER_IP_PER_DAY = saved;
console.log("✓ ip: হেডারের ক্রম, IPv6 /64 ও mapped-IPv4 স্বাভাবিকীকরণ, সল্টযুক্ত হ্যাশ, সীমার env");

// 8) নবায়ন হিসাব
assert.deepEqual(renewalQuote("basic", 1), { amount: 499, periodDays: 30 });
assert.deepEqual(renewalQuote("standard", 3), { amount: 2997, periodDays: 90 });
assert.deepEqual(renewalQuote("premium", 12), { amount: 23988, periodDays: 360 });
assert.equal(isRenewalMonths(6), true);
assert.equal(isRenewalMonths(4), false);
assert.equal(isRenewalMonths("1"), false);
assert.equal(isRequestMethod("bkash"), true);
assert.equal(isRequestMethod("cash"), false, "ক্যাশ শুধু অ্যাডমিন রেকর্ড করে");
console.log("✓ renewalQuote: প্ল্যান × মাস, মেয়াদ ৩০ × মাস");

// 9) রিমাইন্ডার ইমেইল
const sample = (kind: DueReminder["kind"], name = "Sampan"): DueReminder => ({
  restaurant_id: "r1",
  name,
  slug: "sampan",
  owner_email: "o@example.com",
  service_until: "2026-12-05T10:00:00Z",
  kind,
});
const subjects = new Set<string>();
for (const kind of ["d7", "d3", "d1", "expired"] as const) {
  const m = buildReminderEmail(sample(kind), "https://app.example.com/");
  assert.ok(m.subject.includes("Sampan"), kind);
  assert.ok(m.html.includes("https://app.example.com/dashboard"), "ডাবল-স্ল্যাশ ছাড়া লিংক");
  assert.ok(!m.html.includes("com//dashboard"));
  assert.ok(m.text.includes("https://app.example.com/dashboard"));
  assert.ok(m.html.includes("<b>Sampan</b>"));
  subjects.add(m.subject);
}
assert.equal(subjects.size, 4, "চার ধরনের বিষয় আলাদা");
assert.ok(buildReminderEmail(sample("expired"), "https://a.b").html.includes("বন্ধ"));
const evil = buildReminderEmail(sample("d3", `<script>alert(1)</script> "Cafe" & 'Co'`), "https://a.b");
assert.ok(!evil.html.includes("<script>"), "রেস্টুরেন্টের নামে HTML ইনজেকশন escape");
assert.ok(evil.html.includes("&lt;script&gt;"));
assert.equal(escapeHtml(`<a href="x">&'`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
assert.equal(isReminderKind("d7"), true);
assert.equal(isReminderKind("d30"), false);
assert.equal(readEmailConfig({}), null);
assert.equal(readEmailConfig({ RESEND_API_KEY: "k" }), null, "EMAIL_FROM ছাড়া নয়");
assert.equal(readEmailConfig({ EMAIL_FROM: "a@b.c" }), null);
assert.deepEqual(readEmailConfig({ RESEND_API_KEY: " k ", EMAIL_FROM: "A <a@b.c>" }), {
  apiKey: "k",
  from: "A <a@b.c>",
  apiUrl: "https://api.resend.com/emails",
});
console.log("✓ reminders: ৪ ধরনের ইমেইল, লিংক, HTML escape, ইমেইল কনফিগ");

console.log("\nসব টেস্ট পাস ✅");
