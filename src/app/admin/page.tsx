"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import OverviewTab from "@/components/admin/OverviewTab";
import PaymentsTab from "@/components/admin/PaymentsTab";
import RequestsTab from "@/components/admin/RequestsTab";
import RestaurantsTab from "@/components/admin/RestaurantsTab";
import { adminFetch } from "@/components/admin/adminApi";
import { getBrowserClient } from "@/lib/supabase-browser";
import type { AdminPaymentRequest, AdminRestaurant, AdminStatsResponse } from "@/lib/types";

type Tab = "overview" | "restaurants" | "requests" | "payments";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "ওভারভিউ" },
  { key: "restaurants", label: "রেস্টুরেন্ট" },
  { key: "requests", label: "অনুরোধ" },
  { key: "payments", label: "পেমেন্ট" },
];

type Gate = "loading" | "ready" | "forbidden" | "error";

export default function AdminPage() {
  const router = useRouter();
  const [gate, setGate] = useState<Gate>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<AdminStatsResponse | null>(null);
  const [restaurants, setRestaurants] = useState<AdminRestaurant[]>([]);
  const [payFor, setPayFor] = useState<string | null>(null);
  const [pendingRequests, setPendingRequests] = useState(0);

  const load = useCallback(async () => {
    try {
      const { data: s } = await getBrowserClient().auth.getSession();
      const t = s.session?.access_token;
      if (!t) {
        router.replace("/login?next=/admin");
        return;
      }
      setToken(t);

      const [statsRes, listRes, reqRes] = await Promise.all([
        adminFetch<AdminStatsResponse>(t, "/api/admin/stats"),
        adminFetch<{ restaurants: AdminRestaurant[] }>(t, "/api/admin/restaurants"),
        adminFetch<{ requests: AdminPaymentRequest[] }>(t, "/api/admin/payment-requests?status=pending"),
      ]);

      // 401 = সেশন শেষ → আবার লগইন; 403 = লগইন আছে কিন্তু অ্যাডমিন নন
      if (statsRes.ok === false && statsRes.status === 401) {
        router.replace("/login?next=/admin");
        return;
      }
      if (statsRes.ok === false && statsRes.status === 403) {
        setGate("forbidden");
        return;
      }
      if (!statsRes.ok || !listRes.ok) {
        setMessage(!statsRes.ok ? statsRes.error : !listRes.ok ? listRes.error : null);
        setGate("error");
        return;
      }

      setStats(statsRes.data);
      setRestaurants(listRes.data.restaurants);
      // অনুরোধের সংখ্যা ব্যাজের জন্য — এটা ব্যর্থ হলেও বাকি প্যানেল চলবে
      setPendingRequests(reqRes.ok ? reqRes.data.requests.length : 0);
      setGate("ready");
    } catch {
      setMessage("ইন্টারনেট সংযোগ পরীক্ষা করুন");
      setGate("error");
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function signOut() {
    await getBrowserClient().auth.signOut();
    router.replace("/login");
  }

  if (gate === "loading") {
    return <main className="px-4 py-20 text-center text-slate-500">লোড হচ্ছে…</main>;
  }

  if (gate === "forbidden") {
    return (
      <main className="mx-auto max-w-md px-4 py-20 text-center">
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-red-700">
          এই অ্যাকাউন্ট অ্যাডমিন নয়।
        </p>
        <button onClick={signOut} className="mt-6 font-semibold text-brand-700 underline">
          অন্য অ্যাকাউন্টে লগইন করুন
        </button>
      </main>
    );
  }

  if (gate === "error" || !stats || !token) {
    return (
      <main className="mx-auto max-w-md px-4 py-20 text-center">
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-red-700">
          {message ?? "অ্যাডমিন প্যানেল লোড করা যায়নি"}
        </p>
        <button onClick={() => void load()} className="mt-6 font-semibold text-brand-700 underline">
          আবার চেষ্টা করুন
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-slate-900">🛠️ অ্যাডমিন প্যানেল</h1>
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

      <div role="tablist" aria-label="অ্যাডমিন বিভাগ" className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            id={`tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`panel-${t.key}`}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-bold transition ${
              tab === t.key ? "border-brand-500 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
            {t.key === "requests" && pendingRequests > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[11px] font-extrabold text-white">
                {pendingRequests.toLocaleString("bn-BD")}
              </span>
            )}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "overview" && <OverviewTab data={stats} />}
        {tab === "restaurants" && (
          <RestaurantsTab
            token={token}
            restaurants={restaurants}
            onChanged={() => void load()}
            onPay={(id) => {
              setPayFor(id);
              setTab("payments");
            }}
          />
        )}
        {tab === "requests" && <RequestsTab token={token} onChanged={() => void load()} />}
        {tab === "payments" && (
          <PaymentsTab token={token} restaurants={restaurants} preselect={payFor} onChanged={() => void load()} />
        )}
      </div>
    </main>
  );
}
