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
  restaurant: { name: string; slug: string; plan: Plan };
  stats: DashboardStats;
}
