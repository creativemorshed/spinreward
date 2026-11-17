/**
 * সার্ভার-সাইড reward লজিক। randomInt ইনজেক্ট করা হয় যাতে টেস্ট করা যায়;
 * প্রোডাকশনে node:crypto-র randomInt (cryptographically secure) পাঠানো হয়।
 */

export type RandomInt = (maxExclusive: number) => number;

/** weight অনুযায়ী একটি index বাছাই। মোট weight ০ হলে null। */
export function pickWeightedIndex(weights: number[], randomInt: RandomInt): number | null {
  const total = weights.reduce((sum, w) => sum + Math.max(0, w), 0);
  if (total <= 0) return null;

  let roll = randomInt(total); // 0 .. total-1
  for (let i = 0; i < weights.length; i++) {
    const w = Math.max(0, weights[i]);
    if (roll < w) return i;
    roll -= w;
  }
  return null; // কাগজে অসম্ভব, তবু নিরাপত্তার জন্য
}

// 0/O, 1/I/L বাদ — ক্যাশিয়ার ভুল পড়বে না
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateCouponCode(randomInt: RandomInt, length = 8): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

/** শেয়ার-লিংকের রেফারেল কোড (১০ অক্ষর, ছোট হাতের) — একই বিভ্রান্তিকর অক্ষর বাদ */
export function generateRefCode(randomInt: RandomInt, length = 10): string {
  return generateCouponCode(randomInt, length).toLowerCase();
}

export function isValidRefCode(code: string): boolean {
  return /^[a-hjkmnp-z2-9]{10}$/.test(code);
}

/** ইউজারের টাইপ করা কোড স্বাভাবিক করা: স্পেস/ড্যাশ বাদ, বড় হাতের অক্ষর */
export function normalizeCouponCode(input: string): string {
  return input.replace(/[\s-]/g, "").toUpperCase();
}

export function isValidCouponCode(code: string): boolean {
  return /^[A-HJKMNP-Z2-9]{8}$/.test(code);
}
