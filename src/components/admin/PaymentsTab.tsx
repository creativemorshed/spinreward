"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  METHODS_REQUIRING_REFERENCE,
  METHOD_LABEL,
  PAYMENT_METHODS,
  PLAN_KEYS,
  PLAN_LABEL,
  PLAN_PRICE,
  formatTaka,
  type PaymentMethod,
} from "@/lib/plans";
import type { AdminPayment, AdminRestaurant, Plan } from "@/lib/types";
import { adminFetch, formatDate, inputClass } from "./adminApi";

interface Props {
  token: string;
  restaurants: AdminRestaurant[];
  preselect: string | null;
  onChanged: () => void;
}

function RecordForm({ token, restaurants, preselect, onRecorded }: Omit<Props, "onChanged"> & { onRecorded: () => void }) {
  const [restaurantId, setRestaurantId] = useState(preselect ?? "");
  const [plan, setPlan] = useState<Plan>("basic");
  const [amount, setAmount] = useState(String(PLAN_PRICE.basic));
  const [amountTouched, setAmountTouched] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("bkash");
  const [reference, setReference] = useState("");
  const [periodDays, setPeriodDays] = useState("30");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // অন্য ট্যাব থেকে "পেমেন্ট নিন" চাপলে রেস্টুরেন্ট ও তার বর্তমান প্ল্যান আগে থেকে বসে
  useEffect(() => {
    if (!preselect) return;
    setRestaurantId(preselect);
    const r = restaurants.find((x) => x.id === preselect);
    if (r) {
      setPlan(r.plan);
      setAmount(String(PLAN_PRICE[r.plan]));
      setAmountTouched(false);
    }
  }, [preselect, restaurants]);

  const needsRef = METHODS_REQUIRING_REFERENCE.includes(method);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    const res = await adminFetch<{ serviceUntil: string }>(token, "/api/admin/payments", {
      method: "POST",
      body: JSON.stringify({
        restaurantId,
        amount: Number(amount),
        plan,
        method,
        reference,
        periodDays: Number(periodDays),
        note,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSuccess(`✓ পেমেন্ট রেকর্ড হয়েছে। নতুন মেয়াদ: ${formatDate(res.data.serviceUntil)} পর্যন্ত`);
    setReference("");
    setNote("");
    onRecorded();
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-3">
      <h2 className="font-bold text-slate-900 sm:col-span-2 lg:col-span-3">পেমেন্ট রেকর্ড করুন</h2>

      <label className="block sm:col-span-2 lg:col-span-1">
        <span className="text-sm font-medium text-slate-700">রেস্টুরেন্ট</span>
        <select
          required
          value={restaurantId}
          onChange={(e) => {
            setRestaurantId(e.target.value);
            const r = restaurants.find((x) => x.id === e.target.value);
            if (r) {
              setPlan(r.plan);
              if (!amountTouched) setAmount(String(PLAN_PRICE[r.plan]));
            }
          }}
          className={`mt-1 ${inputClass}`}
        >
          <option value="">— বাছুন —</option>
          {restaurants.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ({r.slug})
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">প্ল্যান</span>
        <select
          value={plan}
          onChange={(e) => {
            const p = e.target.value as Plan;
            setPlan(p);
            if (!amountTouched) setAmount(String(PLAN_PRICE[p]));
          }}
          className={`mt-1 ${inputClass}`}
        >
          {PLAN_KEYS.map((p) => (
            <option key={p} value={p}>
              {PLAN_LABEL[p]} — {formatTaka(PLAN_PRICE[p])}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">পরিমাণ (৳)</span>
        <input
          required
          type="number"
          min={1}
          max={1000000}
          step={1}
          value={amount}
          onChange={(e) => {
            setAmountTouched(true);
            setAmount(e.target.value);
          }}
          className={`mt-1 ${inputClass}`}
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">মাধ্যম</span>
        <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className={`mt-1 ${inputClass}`}>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {METHOD_LABEL[m]}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">
          ট্রানজেকশন আইডি {needsRef ? <span className="text-red-600">*</span> : "(ঐচ্ছিক)"}
        </span>
        <input
          required={needsRef}
          minLength={3}
          maxLength={64}
          value={reference}
          onChange={(e) => setReference(e.target.value.toUpperCase())}
          placeholder="যেমন: 9A7B3C2D1E"
          autoComplete="off"
          className={`mt-1 font-mono ${inputClass}`}
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">মেয়াদ (দিন)</span>
        <input
          required
          type="number"
          min={1}
          max={366}
          value={periodDays}
          onChange={(e) => setPeriodDays(e.target.value)}
          className={`mt-1 ${inputClass}`}
        />
      </label>

      <label className="block sm:col-span-2 lg:col-span-3">
        <span className="text-sm font-medium text-slate-700">নোট (ঐচ্ছিক)</span>
        <input maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} className={`mt-1 ${inputClass}`} />
      </label>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2 lg:col-span-3">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800 sm:col-span-2 lg:col-span-3">
          {success}
        </p>
      )}

      <div className="sm:col-span-2 lg:col-span-3">
        <button
          type="submit"
          disabled={loading || !restaurantId}
          className="rounded-lg bg-green-600 px-5 py-2.5 font-bold text-white transition enabled:hover:bg-green-700 disabled:opacity-60"
        >
          {loading ? "সংরক্ষণ হচ্ছে…" : "পেমেন্ট সংরক্ষণ ও মেয়াদ বাড়ান"}
        </button>
        <p className="mt-2 text-xs text-slate-500">
          মেয়াদ বাকি থাকলে তার উপরে দিন যোগ হয়; মেয়াদ শেষ হয়ে গেলে আজ থেকে গোনা শুরু। প্ল্যানও এই পেমেন্টের প্ল্যানে বদলে যায়।
        </p>
      </div>
    </form>
  );
}

export default function PaymentsTab({ token, restaurants, preselect, onChanged }: Props) {
  const [payments, setPayments] = useState<AdminPayment[] | null>(null);
  const [limit, setLimit] = useState(200);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const qs = filter ? `?restaurant=${encodeURIComponent(filter)}` : "";
    const res = await adminFetch<{ payments: AdminPayment[]; limit: number }>(token, `/api/admin/payments${qs}`);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    setPayments(res.data.payments);
    setLimit(res.data.limit);
  }, [token, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const sum = (payments ?? []).reduce((s, p) => s + p.amount, 0);
  const truncated = (payments?.length ?? 0) >= limit;

  return (
    <div className="space-y-6">
      <RecordForm
        token={token}
        restaurants={restaurants}
        preselect={preselect}
        onRecorded={() => {
          void load();
          onChanged();
        }}
      />

      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-bold text-slate-900">পেমেন্টের খাতা</h2>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="রেস্টুরেন্ট অনুযায়ী ফিল্টার"
          className={`w-auto ${inputClass}`}
        >
          <option value="">সব রেস্টুরেন্ট</option>
          {restaurants.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        {payments && (
          <span className="ml-auto text-sm text-slate-600">
            {payments.length.toLocaleString("bn-BD")}টি পেমেন্ট · মোট <b>{formatTaka(sum)}</b>
            {truncated && <span className="text-amber-700"> (সর্বশেষ {limit.toLocaleString("bn-BD")}টি)</span>}
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">তারিখ</th>
              <th className="px-4 py-3">রেস্টুরেন্ট</th>
              <th className="px-4 py-3">প্ল্যান</th>
              <th className="px-4 py-3">মাধ্যম / TrxID</th>
              <th className="px-4 py-3">মেয়াদ</th>
              <th className="px-4 py-3 text-right">পরিমাণ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {payments === null && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  লোড হচ্ছে…
                </td>
              </tr>
            )}
            {payments?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  এখনও কোনো পেমেন্ট রেকর্ড করা হয়নি
                </td>
              </tr>
            )}
            {payments?.map((p) => (
              <tr key={p.id}>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(p.paid_at)}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{p.restaurants?.name ?? "—"}</td>
                <td className="px-4 py-3">{PLAN_LABEL[p.plan]}</td>
                <td className="px-4 py-3">
                  {METHOD_LABEL[p.method as PaymentMethod] ?? p.method}
                  {p.reference && <span className="ml-2 font-mono text-xs text-slate-500">{p.reference}</span>}
                  {p.note && <p className="text-xs text-slate-400">{p.note}</p>}
                </td>
                <td className="px-4 py-3 text-slate-600">{p.period_days.toLocaleString("bn-BD")} দিন</td>
                <td className="px-4 py-3 text-right font-bold tabular-nums">{formatTaka(p.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
