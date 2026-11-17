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
import {
  daysLeft,
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

console.log("\nসব টেস্ট পাস ✅");
