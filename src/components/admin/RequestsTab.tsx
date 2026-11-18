"use client";

import { useCallback, useEffect, useState } from "react";
import { METHOD_LABEL, PLAN_LABEL, formatTaka, type PaymentMethod } from "@/lib/plans";
import type { AdminPaymentRequest } from "@/lib/types";
import { adminFetch, formatDate } from "./adminApi";

interface Props {
  token: string;
  /** অনুমোদনে মেয়াদ/আয়ের সংখ্যা বদলায়, তাই বাইরের ডেটাও রিফ্রেশ করতে হয় */
  onChanged: () => void;
}

const STATUS_STYLE = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
} as const;
const STATUS_LABEL = { pending: "অপেক্ষমাণ", approved: "অনুমোদিত", rejected: "বাতিল" } as const;

export default function RequestsTab({ token, onChanged }: Props) {
  const [showAll, setShowAll] = useState(false);
  const [requests, setRequests] = useState<AdminPaymentRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await adminFetch<{ requests: AdminPaymentRequest[] }>(
      token,
      `/api/admin/payment-requests?status=${showAll ? "all" : "pending"}`,
    );
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    setRequests(res.data.requests);
  }, [token, showAll]);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(r: AdminPaymentRequest, action: "approve" | "reject") {
    let note = "";
    if (action === "reject") {
      const reason = window.prompt("বাতিলের কারণ লিখুন (মালিক এটা দেখবেন):", "");
      if (reason === null) return;
      note = reason.trim();
      if (!note) {
        setError("বাতিলের কারণ ছাড়া বাতিল করা যায় না");
        return;
      }
    } else if (
      !window.confirm(
        `${r.restaurants?.name ?? "রেস্টুরেন্ট"}: ${formatTaka(r.amount)} (${METHOD_LABEL[r.method as PaymentMethod] ?? r.method}, ${r.reference})\n\nআপনার ${METHOD_LABEL[r.method as PaymentMethod] ?? r.method} অ্যাকাউন্টে এই TrxID-তে ঠিক এই পরিমাণ টাকা এসেছে নিশ্চিত?`,
      )
    ) {
      return;
    }

    setBusyId(r.id);
    setError(null);
    setNotice(null);
    const res = await adminFetch<{ status: string; service_until?: string }>(token, `/api/admin/payment-requests/${r.id}`, {
      method: "POST",
      body: JSON.stringify({ action, note }),
    });
    setBusyId(null);
    if (!res.ok) {
      setError(res.error);
      void load(); // হয়তো অন্য কেউ আগেই সিদ্ধান্ত নিয়েছে
      return;
    }
    setNotice(
      action === "approve"
        ? `✓ অনুমোদিত। নতুন মেয়াদ: ${formatDate(res.data.service_until)} পর্যন্ত`
        : "অনুরোধ বাতিল করা হয়েছে",
    );
    void load();
    onChanged();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-bold text-slate-900">মালিকদের নবায়ন অনুরোধ</h2>
        <label className="ml-auto flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          যাচাই হওয়াগুলোও দেখান
        </label>
      </div>

      <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900">
        অনুমোদনের আগে নিজের bKash/Nagad/Rocket/ব্যাংকে TrxID ও পরিমাণ মিলিয়ে নিন। সিস্টেম টাকা আসা যাচাই করতে পারে না।
      </p>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
          {notice}
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">জমার তারিখ</th>
              <th className="px-4 py-3">রেস্টুরেন্ট</th>
              <th className="px-4 py-3">প্ল্যান / মেয়াদ</th>
              <th className="px-4 py-3">মাধ্যম / TrxID</th>
              <th className="px-4 py-3 text-right">পরিমাণ</th>
              <th className="px-4 py-3 text-right">সিদ্ধান্ত</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {requests === null && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  লোড হচ্ছে…
                </td>
              </tr>
            )}
            {requests?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  {showAll ? "এখনও কোনো অনুরোধ আসেনি" : "কোনো অপেক্ষমাণ অনুরোধ নেই 🎉"}
                </td>
              </tr>
            )}
            {requests?.map((r) => {
              const busy = busyId === r.id;
              return (
                <tr key={r.id} className={busy ? "opacity-60" : undefined}>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(r.created_at)}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{r.restaurants?.name ?? "—"}</td>
                  <td className="px-4 py-3">
                    {PLAN_LABEL[r.plan]}
                    <p className="text-xs text-slate-500">{r.period_days.toLocaleString("bn-BD")} দিন</p>
                  </td>
                  <td className="px-4 py-3">
                    {METHOD_LABEL[r.method as PaymentMethod] ?? r.method}
                    <p className="select-all font-mono text-xs text-slate-600">{r.reference}</p>
                    {r.note && <p className="text-xs text-slate-400">“{r.note}”</p>}
                  </td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums">{formatTaka(r.amount)}</td>
                  <td className="px-4 py-3">
                    {r.status === "pending" ? (
                      <div className="flex justify-end gap-2">
                        <button
                          disabled={busy}
                          onClick={() => void decide(r, "approve")}
                          className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-green-700 disabled:opacity-60"
                        >
                          অনুমোদন
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => void decide(r, "reject")}
                          className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                        >
                          বাতিল
                        </button>
                      </div>
                    ) : (
                      <div className="text-right">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_STYLE[r.status]}`}>
                          {STATUS_LABEL[r.status]}
                        </span>
                        {r.admin_note && <p className="mt-1 text-xs text-slate-500">{r.admin_note}</p>}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
