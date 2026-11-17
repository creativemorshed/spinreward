"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import DailyChart from "@/components/DailyChart";
import RedeemForm from "@/components/RedeemForm";
import StatCard from "@/components/StatCard";
import ChangePassword from "@/components/ChangePassword";
import { daysLeft } from "@/lib/plans";
import { getBrowserClient } from "@/lib/supabase-browser";
import type { DashboardResponse } from "@/lib/types";

const PLAN_LABEL = { basic: "Basic", standard: "Standard", premium: "Premium" } as const;

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const getToken = useCallback(async () => {
    const { data: s } = await getBrowserClient().auth.getSession();
    return s.session?.access_token ?? null;
  }, []);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) {
        router.replace("/login");
        return;
      }
      const res = await fetch("/api/dashboard?days=14", { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) {
        // হয় সেশন মেয়াদোত্তীর্ণ, নয় এই ইউজারের কোনো রেস্টুরেন্ট নেই
        setError("এই অ্যাকাউন্টে কোনো সক্রিয় রেস্টুরেন্ট যুক্ত নেই, অথবা সেশন শেষ হয়েছে।");
        return;
      }
      if (!res.ok) {
        setError("ড্যাশবোর্ড লোড করা যায়নি");
        return;
      }
      setData((await res.json()) as DashboardResponse);
      setError(null);
    } catch {
      setError("ইন্টারনেট সংযোগ পরীক্ষা করুন");
    }
  }, [getToken, router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function signOut() {
    await getBrowserClient().auth.signOut();
    router.replace("/login");
  }

  if (error) {
    return (
      <main className="mx-auto max-w-md px-4 py-20 text-center">
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-red-700">
          {error}
        </p>
        <button onClick={signOut} className="mt-6 font-semibold text-brand-700 underline">
          আবার লগইন করুন
        </button>
      </main>
    );
  }

  if (!data) {
    return <main className="px-4 py-20 text-center text-slate-500">লোড হচ্ছে…</main>;
  }

  const { restaurant, stats } = data;
  const serviceDays = daysLeft(restaurant.serviceUntil);
  const spinUrl = typeof window !== "undefined" ? `${window.location.origin}/r/${restaurant.slug}` : `/r/${restaurant.slug}`;

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">{restaurant.name}</h1>
          <span className="mt-1 inline-block rounded-full bg-brand-100 px-3 py-0.5 text-xs font-bold text-brand-700">
            {PLAN_LABEL[restaurant.plan]} প্ল্যান
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void load()}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            রিফ্রেশ
          </button>
          <button
            onClick={signOut}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            লগআউট
          </button>
        </div>
      </header>

      {serviceDays <= 0 ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          ⛔ আপনার সাবস্ক্রিপশনের মেয়াদ শেষ হয়েছে, তাই কাস্টমারদের স্পিন পেজ এখন বন্ধ। নবায়ন করতে আমাদের সাথে যোগাযোগ করুন।
        </p>
      ) : serviceDays <= 7 ? (
        <p role="status" className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          ⏳ আপনার সাবস্ক্রিপশনের মেয়াদ আর {serviceDays.toLocaleString("bn-BD")} দিন বাকি। বন্ধ হওয়ার আগে নবায়ন করে নিন।
        </p>
      ) : null}

      <section aria-label="সারসংক্ষেপ" className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="মোট স্পিন" value={stats.total_spins.toLocaleString("bn-BD")} />
        <StatCard label="মোট কুপন" value={stats.total_coupons.toLocaleString("bn-BD")} />
        <StatCard
          label="মোট রিডিম"
          value={stats.total_redemptions.toLocaleString("bn-BD")}
          hint={
            stats.total_coupons > 0
              ? `রিডিম হার ${Math.round((stats.total_redemptions / stats.total_coupons) * 100)}%`
              : undefined
          }
        />
        <StatCard
          label="সবচেয়ে বেশি জেতা পুরস্কার"
          value={stats.most_won?.label ?? "—"}
          hint={stats.most_won ? `${stats.most_won.wins} বার` : undefined}
        />
        <StatCard label="মোট ভিজিটর" value={(stats.total_visitors ?? 0).toLocaleString("bn-BD")} />
        <StatCard
          label="শেয়ার থেকে আসা নতুন ভিজিটর"
          value={(stats.referred_visitors ?? 0).toLocaleString("bn-BD")}
          hint={
            stats.total_visitors > 0
              ? `মোট ভিজিটরের ${Math.round(((stats.referred_visitors ?? 0) / stats.total_visitors) * 100)}%`
              : "ভাইরাল লুপ থেকে"
          }
        />
        <StatCard
          label="বোনাস স্পিন ব্যবহার"
          value={(stats.bonus_spins_used ?? 0).toLocaleString("bn-BD")}
          hint="শেয়ার/রেফারেল থেকে অর্জিত"
        />
      </section>

      <DailyChart data={stats.daily} />

      <section className="grid gap-6 md:grid-cols-2">
        {/* QR */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-bold text-slate-900">আপনার QR কোড</h2>
          <p className="mt-1 text-sm text-slate-500">প্রিন্ট করে টেবিলে বা কাউন্টারে বসান।</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/qr/${restaurant.slug}`}
            alt={`${restaurant.name}-এর স্পিন হুইল QR কোড`}
            width={220}
            height={220}
            className="mx-auto mt-4 rounded-xl border border-slate-200"
          />
          <p className="mt-3 break-all text-center text-xs text-slate-500">{spinUrl}</p>
          <div className="mt-4 flex gap-2">
            <a
              href={`/api/qr/${restaurant.slug}?download=1`}
              className="flex-1 rounded-lg bg-brand-500 px-4 py-2 text-center font-bold text-white hover:bg-brand-600"
            >
              PNG ডাউনলোড
            </a>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(spinUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  /* ক্লিপবোর্ড ব্লক — উপেক্ষা */
                }
              }}
              className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50"
            >
              {copied ? "কপি হয়েছে ✓" : "লিংক কপি"}
            </button>
          </div>
        </div>

        <RedeemForm getToken={getToken} onRedeemed={() => void load()} />
      </section>

      <ChangePassword />
    </main>
  );
}
