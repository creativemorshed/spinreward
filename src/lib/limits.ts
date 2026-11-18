/**
 * অ্যান্টি-ফ্রডের সীমা — এক জায়গায়।
 *
 * ⚠️ রেস্টুরেন্টের WiFi-তে সব কাস্টমার একই IP-তে থাকে (এবং মোবাইল ক্যারিয়ারও অনেক ডিভাইসকে এক IP দেয়)।
 * তাই দৈনিক সীমা ইচ্ছাকৃতভাবে উদার: এটা শুধু স্ক্রিপ্ট/ফার্মিং ঠেকানোর শেষ নিরাপত্তা-জাল, বৈধ কাস্টমারকে আটকানো নয়।
 * ব্যস্ত রেস্টুরেন্টে সমস্যা হলে `MAX_SPINS_PER_IP_PER_DAY` env দিয়ে বাড়ান।
 */
function envInt(name: string, fallback: number, min: number, max: number): number {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

export const LIMITS = {
  /** এক IP থেকে এক রেস্টুরেন্টে দিনে (ঢাকার সময়) সর্বোচ্চ স্পিন (ফ্রি + বোনাস মিলিয়ে) */
  get spinsPerIpPerDay() {
    return envInt("MAX_SPINS_PER_IP_PER_DAY", 100, 5, 10_000);
  },
  /** একই IP থেকে ১ মিনিটে সর্বোচ্চ অনুরোধ (visitor/spin/share/payment-request মিলিয়ে) — স্ক্রিপ্ট ঠেকাতে */
  burstWindowSeconds: 60,
  get burstMax() {
    return envInt("MAX_REQUESTS_PER_IP_PER_MINUTE", 60, 10, 10_000);
  },
};
