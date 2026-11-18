export type Plan = "basic" | "standard" | "premium";

/** স্পিন পেজে কাস্টমারকে যা দেখানো হয় (weight কখনও ক্লায়েন্টে যায় না) */
export interface PublicReward {
  position: number;
  label: string;
  discountAmount: number;
  color: string;
}

export interface PublicRestaurant {
  name: string;
  slug: string;
  rewards: PublicReward[];
}

export interface SpinResponse {
  rewardIndex: number;
  reward: { label: string; discountAmount: number };
  coupon: { code: string; discountAmount: number; expiresAt: string } | null;
  /** এই স্পিনটি বোনাস স্পিন ছিল কি */
  usedBonus: boolean;
  /** স্পিনের পর বাকি বোনাস স্পিন */
  bonusSpins: number;
  refCode: string;
}

export interface VisitorResponse {
  refCode: string;
  bonusSpins: number;
  freeSpinAvailable: boolean;
}

export interface ShareResponse {
  /** আজকের শেয়ার-বোনাস এই কলে দেওয়া হলো কি (দিনে একবার) */
  granted: boolean;
  bonusSpins: number;
}

export interface DailyPoint {
  day: string; // YYYY-MM-DD
  spins: number;
  redemptions: number;
}

export interface DashboardStats {
  total_spins: number;
  total_coupons: number;
  total_redemptions: number;
  /** ভাইরাল লুপ (migration 002 চালানোর পর থেকে) */
  total_visitors: number;
  referred_visitors: number;
  bonus_spins_used: number;
  most_won: { label: string; wins: number } | null;
  daily: DailyPoint[];
}

export interface DashboardResponse {
  restaurant: { name: string; slug: string; plan: Plan; serviceUntil: string };
  stats: DashboardStats;
}

/* ---------------- Admin Panel ---------------- */

export interface AdminRestaurant {
  id: string;
  name: string;
  slug: string;
  plan: Plan;
  is_active: boolean;
  service_until: string;
  created_at: string;
  owner_email: string | null;
  spins: number;
  payments_count: number;
  last_payment_at: string | null;
}

export interface AdminPayment {
  id: string;
  amount: number;
  plan: Plan;
  method: string;
  reference: string | null;
  period_days: number;
  note: string | null;
  paid_at: string;
  restaurants: { name: string; slug: string } | null;
}

export interface PlatformStats {
  restaurants_total: number;
  restaurants_suspended: number;
  restaurants_expired: number;
  restaurants_paying: number;
  restaurants_trial: number;
  expiring_soon: number;
  paying_by_plan: Record<Plan, number>;
  revenue_total: number;
  revenue_month: number;
  revenue_by_month: { month: string; amount: number }[];
  total_spins: number;
  total_coupons: number;
  total_redemptions: number;
  total_visitors: number;
  referred_visitors: number;
  daily: DailyPoint[];
  top_restaurants: { name: string; slug: string; spins: number }[];
}

export interface AdminStatsResponse {
  stats: PlatformStats;
  mrr: number;
}

/* ---------------- পেমেন্ট নবায়ন অনুরোধ ---------------- */

export type PaymentRequestStatus = "pending" | "approved" | "rejected";

export interface PaymentRequest {
  id: string;
  plan: Plan;
  amount: number;
  method: string;
  reference: string;
  period_days: number;
  note: string | null;
  status: PaymentRequestStatus;
  admin_note: string | null;
  created_at: string;
  reviewed_at: string | null;
}

/** অ্যাডমিনের তালিকায় রেস্টুরেন্টের নাম সহ */
export interface AdminPaymentRequest extends PaymentRequest {
  restaurants: { name: string; slug: string } | null;
}

/** মালিক যে নম্বরে টাকা পাঠাবেন (সার্ভারের env থেকে; সেট না থাকলে ফাঁকা) */
export interface PaymentInstructions {
  bkash?: string;
  nagad?: string;
  rocket?: string;
  bank?: string;
}

export interface RenewalResponse {
  requests: PaymentRequest[];
  instructions: PaymentInstructions;
}
