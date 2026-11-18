"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  METHOD_LABEL,
  PLAN_KEYS,
  PLAN_LABEL,
  PLAN_PRICE,
  RENEWAL_MONTHS,
  REQUEST_METHODS,
  formatTaka,
  renewalQuote,
  type RenewalMonths,
  type RequestMethod,
} from "@/lib/plans";
import type { PaymentRequest, Plan, RenewalResponse } from "@/lib/types";

interface Props {
  getToken: () => Promise<string | null>;
  currentPlan: Plan;
  /** মেয়াদ শেষ/শীঘ্রই শেষ হলে কার্ড খোলা অবস্থায় দেখানো হয় */
  urgent: boolean;
  /** অনুমোদনের পরে ড্যাশবোর্ডের মেয়াদ হালনাগাদ করতে */
  onApprovedSeen: () => void;
}

const STATUS_STYLE = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
} as const;
const STATUS_LABEL = { pending: "যাচাইয়ের অপেক্ষায়", approved: "অনুমোদিত", rejected: "বাতিল" } as const;

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

export default function RenewalCard({ getToken, currentPlan, urgent, onApprovedSeen }: Props) {
  const [data, setData] = useState<RenewalResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan>(currentPlan);
  const [months, setMonths] = useState<RenewalMonths>(1);
  const [method, setMethod] = useState<RequestMethod>("bkash");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch("/api/payment-requests", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (!res.ok) {
        setLoadError("নবায়নের তথ্য লোড করা যায়নি");
        return;
      }
      const json = (await res.json()) as RenewalResponse;
      setData(json);
      setLoadError(null);
    } catch {
      setLoadError("ইন্টারনেট সংযোগ পরীক্ষা করুন");
    }
  }, [getToken]);

  useEffect(() => {
    void load();
  }, [load]);

  // অ্যাডমিন অনুমোদন করলে মালিকের ড্যাশবোর্ডের মেয়াদ/ব্যানারও যেন হালনাগাদ হয়
  const approvedCount = data?.requests.filter((r) => r.status === "approved").length ?? 0;
  const [seenApproved, setSeenApproved] = useState<number | null>(null);
  useEffect(() => {
    if (data === null) return;
    if (seenApproved === null) setSeenApproved(approvedCount);
    else if (approvedCount > seenApproved) {
      setSeenApproved(approvedCount);
      onApprovedSeen();
    }
  }, [data, approvedCount, seenApproved, onApprovedSeen]);

  const quote = renewalQuote(plan, months);
  const number = data?.instructions[method];

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const token = await getToken();
      if (!token) {
        setMessage({ ok: false, text: "সেশন শেষ, আবার লগইন করুন" });
        return;
      }
      const res = await fetch("/api/payment-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan, months, method, reference, note }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMessage({ ok: false, text: json.error ?? "অনুরোধ জমা দেওয়া যায়নি" });
        return;
      }
      setMessage({ ok: true, text: "✓ অনুরোধ জমা হয়েছে। যাচাই শেষে মেয়াদ বাড়ানো হবে — সাধারণত কয়েক ঘণ্টার মধ্যে।" });
      setReference("");
      setNote("");
      void load();
    } catch {
      setMessage({ ok: false, text: "ইন্টারনেট সংযোগ পরীক্ষা করুন" });
    } finally {
      setLoading(false);
    }
  }

  const pendingCount = data?.requests.filter((r) => r.status === "pending").length ?? 0;

  return (
    <details open={urgent || pendingCount > 0} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <summary className="cursor-pointer font-bold text-slate-900">
        সাবস্ক্রিপশন নবায়ন
        {pendingCount > 0 && (
          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
            {pendingCount.toLocaleString("bn-BD")}টি যাচাইয়ের অপেক্ষায়
          </span>
        )}
      </summary>

      <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">প্ল্যান</span>
          <select value={plan} onChange={(e) => setPlan(e.target.value as Plan)} className={`mt-1 ${inputClass}`}>
            {PLAN_KEYS.map((p) => (
              <option key={p} value={p}>
                {PLAN_LABEL[p]} — {formatTaka(PLAN_PRICE[p])}/মাস
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">কত মাসের জন্য</span>
          <select
            value={months}
            onChange={(e) => setMonths(Number(e.target.value) as RenewalMonths)}
            className={`mt-1 ${inputClass}`}
          >
            {RENEWAL_MONTHS.map((m) => (
              <option key={m} value={m}>
                {m.toLocaleString("bn-BD")} মাস
              </option>
            ))}
          </select>
        </label>

        <div className="rounded-xl bg-brand-50 p-4 sm:col-span-2">
          <p className="text-sm text-slate-600">পাঠাতে হবে</p>
          <p className="text-3xl font-black text-brand-700">{formatTaka(quote.amount)}</p>
          <label className="mt-3 block">
            <span className="text-sm font-medium text-slate-700">যে মাধ্যমে পাঠাবেন</span>
            <select value={method} onChange={(e) => setMethod(e.target.value as RequestMethod)} className={`mt-1 ${inputClass}`}>
              {REQUEST_METHODS.map((m) => (
                <option key={m} value={m}>
                  {METHOD_LABEL[m]}
                </option>
              ))}
            </select>
          </label>
          {number ? (
            <p className="mt-3 text-sm text-slate-700">
              {METHOD_LABEL[method]}-এ পাঠান: <b className="select-all text-lg tracking-wide">{number}</b>
              {method !== "bank" && <span className="text-slate-500"> (Send Money / Payment)</span>}
            </p>
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              {data ? "এই মাধ্যমের নম্বরের জন্য আমাদের সাথে যোগাযোগ করুন।" : "লোড হচ্ছে…"}
            </p>
          )}
        </div>

        <label className="block sm:col-span-2">
          <span className="text-sm font-medium text-slate-700">
            টাকা পাঠানোর পর পাওয়া ট্রানজেকশন আইডি (TrxID) <span className="text-red-600">*</span>
          </span>
          <input
            required
            minLength={3}
            maxLength={64}
            value={reference}
            onChange={(e) => setReference(e.target.value.toUpperCase())}
            placeholder="যেমন: 9A7B3C2D1E"
            autoComplete="off"
            spellCheck={false}
            className={`mt-1 font-mono ${inputClass}`}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-sm font-medium text-slate-700">নোট (ঐচ্ছিক)</span>
          <input maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} className={`mt-1 ${inputClass}`} />
        </label>

        {message && (
          <p
            role="status"
            className={`rounded-lg px-3 py-2 text-sm sm:col-span-2 ${message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}
          >
            {message.text}
          </p>
        )}

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-green-600 px-5 py-2.5 font-bold text-white transition enabled:hover:bg-green-700 disabled:opacity-60"
          >
            {loading ? "জমা হচ্ছে…" : "টাকা পাঠিয়েছি, অনুরোধ জমা দিন"}
          </button>
          <p className="mt-2 text-xs text-slate-500">
            আমরা পেমেন্ট যাচাই করে মেয়াদ বাড়িয়ে দেব। ভুল TrxID দিলে অনুরোধ বাতিল হবে।
          </p>
        </div>
      </form>

      {loadError && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {loadError}
        </p>
      )}

      {data && data.requests.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-bold text-slate-900">আপনার অনুরোধ</h3>
          <ul className="mt-2 divide-y divide-slate-100">
            {data.requests.map((r: PaymentRequest) => (
              <li key={r.id} className="py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-slate-800">
                    {PLAN_LABEL[r.plan]} · {formatTaka(r.amount)} · {METHOD_LABEL[r.method as RequestMethod] ?? r.method}{" "}
                    <span className="font-mono text-xs text-slate-500">{r.reference}</span>
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_STYLE[r.status]}`}>
                    {STATUS_LABEL[r.status]}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-400">
                  {new Date(r.created_at).toLocaleDateString("bn-BD", { day: "numeric", month: "short", year: "numeric" })}
                </p>
                {r.status === "rejected" && r.admin_note && (
                  <p className="mt-1 rounded bg-red-50 px-2 py-1 text-xs text-red-700">কারণ: {r.admin_note}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </details>
  );
}
