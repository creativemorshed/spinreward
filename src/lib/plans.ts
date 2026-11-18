import type { Plan } from "./types";

/** প্ল্যানের দাম (৳/মাস) — একমাত্র সত্য-উৎস; MRR ও পেমেন্ট ফর্মের ডিফল্ট এখান থেকে */
export const PLAN_PRICE: Record<Plan, number> = { basic: 499, standard: 999, premium: 1999 };
export const PLAN_KEYS: Plan[] = ["basic", "standard", "premium"];
export const PLAN_LABEL: Record<Plan, string> = { basic: "Basic", standard: "Standard", premium: "Premium" };

export const PAYMENT_METHODS = ["bkash", "nagad", "rocket", "bank", "cash", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const METHOD_LABEL: Record<PaymentMethod, string> = {
  bkash: "bKash",
  nagad: "Nagad",
  rocket: "Rocket",
  bank: "ব্যাংক",
  cash: "ক্যাশ",
  other: "অন্যান্য",
};
/** এই মাধ্যমগুলোতে ট্রানজেকশন আইডি বাধ্যতামূলক (ডুপ্লিকেট এন্ট্রি ঠেকাতে) */
export const METHODS_REQUIRING_REFERENCE: PaymentMethod[] = ["bkash", "nagad", "rocket", "bank"];

export const isPlan = (v: unknown): v is Plan => typeof v === "string" && (PLAN_KEYS as string[]).includes(v);
export const isPaymentMethod = (v: unknown): v is PaymentMethod =>
  typeof v === "string" && (PAYMENT_METHODS as readonly string[]).includes(v);

export const isValidEmail = (v: unknown): v is string =>
  typeof v === "string" && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

export type SubscriptionState = "trial" | "active" | "expiring" | "expired" | "suspended";

export const STATE_LABEL: Record<SubscriptionState, string> = {
  trial: "ট্রায়াল",
  active: "সক্রিয়",
  expiring: "শীঘ্রই শেষ",
  expired: "মেয়াদ শেষ",
  suspended: "স্থগিত",
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** মেয়াদের বাকি দিন (উপরের দিকে গোল; মেয়াদ পেরোলে ০ বা ঋণাত্মক) */
export function daysLeft(serviceUntilIso: string, now = new Date()): number {
  return Math.ceil((new Date(serviceUntilIso).getTime() - now.getTime()) / DAY_MS);
}

export function subscriptionState(
  r: { is_active: boolean; service_until: string; payments_count: number },
  now = new Date(),
): SubscriptionState {
  if (!r.is_active) return "suspended";
  const msLeft = new Date(r.service_until).getTime() - now.getTime();
  if (msLeft <= 0) return "expired";
  if (r.payments_count === 0) return "trial";
  if (msLeft <= 7 * DAY_MS) return "expiring";
  return "active";
}

/** মাসিক পুনরাবৃত্ত আয়: পেমেন্টকারী সক্রিয় রেস্টুরেন্ট × প্ল্যানের দাম */
export function monthlyRecurringRevenue(payingByPlan: Record<Plan, number>): number {
  return PLAN_KEYS.reduce((sum, p) => sum + (payingByPlan[p] ?? 0) * PLAN_PRICE[p], 0);
}

/** ৳ ফরম্যাট (বাংলা সংখ্যা, হাজার-বিভাজক সহ) */
export function formatTaka(amount: number): string {
  return `৳${amount.toLocaleString("bn-BD")}`;
}

/* ---------------- নবায়ন (মালিকের অনুরোধ) ---------------- */

/** মালিক কত মাসের জন্য একসাথে নবায়ন করতে পারবেন */
export const RENEWAL_MONTHS = [1, 2, 3, 6, 12] as const;
export type RenewalMonths = (typeof RENEWAL_MONTHS)[number];
export const isRenewalMonths = (v: unknown): v is RenewalMonths =>
  typeof v === "number" && (RENEWAL_MONTHS as readonly number[]).includes(v);

/** অনুরোধের পরিমাণ ও মেয়াদ সবসময় সার্ভারে গণনা হয় (ক্লায়েন্টের পাঠানো পরিমাণ বিশ্বাস করা হয় না) */
export function renewalQuote(plan: Plan, months: RenewalMonths): { amount: number; periodDays: number } {
  return { amount: PLAN_PRICE[plan] * months, periodDays: 30 * months };
}

/** মালিক যে মাধ্যমগুলোতে অনুরোধ জমা দিতে পারেন (ক্যাশ/অন্যান্য শুধু অ্যাডমিন হাতে রেকর্ড করে) */
export const REQUEST_METHODS = ["bkash", "nagad", "rocket", "bank"] as const;
export type RequestMethod = (typeof REQUEST_METHODS)[number];
export const isRequestMethod = (v: unknown): v is RequestMethod =>
  typeof v === "string" && (REQUEST_METHODS as readonly string[]).includes(v);
