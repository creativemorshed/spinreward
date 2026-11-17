import Link from "next/link";

const PLANS = [
  { name: "Basic", price: "৳499", features: ["১টি রেস্টুরেন্ট", "স্পিন হুইল ও QR কোড", "মৌলিক ড্যাশবোর্ড"] },
  {
    name: "Standard",
    price: "৳999",
    highlight: true,
    features: ["Basic-এর সব কিছু", "পুরস্কার কাস্টমাইজ", "ডেইলি অ্যানালিটিক্স"],
  },
  { name: "Premium", price: "৳1999", features: ["Standard-এর সব কিছু", "একাধিক শাখা", "প্রায়োরিটি সাপোর্ট"] },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <header className="flex items-center justify-between">
        <span className="text-xl font-extrabold text-brand-600">🎡 SpinReward</span>
        <Link href="/login" className="rounded-lg px-4 py-2 font-semibold text-slate-700 hover:bg-brand-100">
          রেস্টুরেন্ট লগইন
        </Link>
      </header>

      <section className="py-16 text-center">
        <h1 className="text-4xl font-black leading-tight text-slate-900 sm:text-5xl">
          কাস্টমার স্পিন করবে,
          <br />
          <span className="text-brand-600">আপনার বিক্রি বাড়বে</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-slate-600">
          টেবিলে QR কোড বসান। কাস্টমার স্ক্যান করে চাকা ঘুরিয়ে ক্যাশ ডিসকাউন্ট জেতে এবং ফেসবুকে শেয়ার করে — নতুন কাস্টমার
          আসে আপনার দরজায়।
        </p>
      </section>

      <section aria-labelledby="pricing" className="pb-12">
        <h2 id="pricing" className="text-center text-2xl font-extrabold">
          মাসিক প্যাকেজ
        </h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-2xl border bg-white p-6 shadow-sm ${
                plan.highlight ? "border-brand-500 ring-2 ring-brand-500" : "border-slate-200"
              }`}
            >
              <h3 className="text-lg font-bold">{plan.name}</h3>
              <p className="mt-2 text-4xl font-black text-slate-900">
                {plan.price}
                <span className="text-base font-medium text-slate-500">/মাস</span>
              </p>
              <ul className="mt-4 space-y-2 text-slate-600">
                {plan.features.map((f) => (
                  <li key={f}>✓ {f}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
