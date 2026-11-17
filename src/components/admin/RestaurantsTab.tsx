"use client";

import { useMemo, useState, type FormEvent } from "react";
import { PLAN_KEYS, PLAN_LABEL, STATE_LABEL, daysLeft, subscriptionState, type SubscriptionState } from "@/lib/plans";
import type { AdminRestaurant, Plan } from "@/lib/types";
import { STATE_STYLE, adminFetch, formatDate, inputClass } from "./adminApi";

interface Props {
  token: string;
  restaurants: AdminRestaurant[];
  onChanged: () => void;
  onPay: (restaurantId: string) => void;
}

interface Created {
  name: string;
  slug: string;
  ownerEmail: string;
  tempPassword: string | null;
}

/** শুধু ইংরেজি নাম হলে slug-এর সাজেশন; বাংলা নামে ফাঁকা (হাতে লিখতে হবে) */
const suggestSlug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

function CreateForm({ token, onCreated }: { token: string; onCreated: (c: Created) => void }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [plan, setPlan] = useState<Plan>("basic");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await adminFetch<{
      restaurant: { name: string; slug: string };
      ownerEmail: string;
      tempPassword: string | null;
    }>(token, "/api/admin/restaurants", { method: "POST", body: JSON.stringify({ name, slug, plan, ownerEmail }) });
    setLoading(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }
    onCreated({
      name: res.data.restaurant.name,
      slug: res.data.restaurant.slug,
      ownerEmail: res.data.ownerEmail,
      tempPassword: res.data.tempPassword,
    });
    setName("");
    setSlug("");
    setSlugTouched(false);
    setOwnerEmail("");
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2">
      <label className="block">
        <span className="text-sm font-medium text-slate-700">রেস্টুরেন্টের নাম</span>
        <input
          required
          minLength={2}
          maxLength={60}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slugTouched) setSlug(suggestSlug(e.target.value));
          }}
          className={`mt-1 ${inputClass}`}
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">slug (লিংকে বসবে: /r/…)</span>
        <input
          required
          pattern="[a-z0-9\-]{3,40}"
          title="৩–৪০ অক্ষর: ছোট হাতের a-z, 0-9, হাইফেন"
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value.toLowerCase());
          }}
          className={`mt-1 ${inputClass}`}
          placeholder="sampan"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">মালিকের ইমেইল</span>
        <input
          required
          type="email"
          value={ownerEmail}
          onChange={(e) => setOwnerEmail(e.target.value)}
          className={`mt-1 ${inputClass}`}
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">প্ল্যান</span>
        <select value={plan} onChange={(e) => setPlan(e.target.value as Plan)} className={`mt-1 ${inputClass}`}>
          {PLAN_KEYS.map((p) => (
            <option key={p} value={p}>
              {PLAN_LABEL[p]}
            </option>
          ))}
        </select>
      </label>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">
          {error}
        </p>
      )}
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-brand-500 px-5 py-2.5 font-bold text-white transition enabled:hover:bg-brand-600 disabled:opacity-60"
        >
          {loading ? "তৈরি হচ্ছে…" : "রেস্টুরেন্ট তৈরি করুন"}
        </button>
        <span className="ml-3 text-xs text-slate-500">১৪ দিনের ফ্রি ট্রায়াল ও ৮টি ডিফল্ট পুরস্কার অটো বসবে।</span>
      </div>
    </form>
  );
}

export default function RestaurantsTab({ token, restaurants, onChanged, onPay }: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | SubscriptionState>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return restaurants
      .map((r) => ({ r, state: subscriptionState(r) }))
      .filter(({ r, state }) => {
        if (filter !== "all" && state !== filter) return false;
        if (!q) return true;
        return (
          r.name.toLowerCase().includes(q) || r.slug.includes(q) || (r.owner_email ?? "").toLowerCase().includes(q)
        );
      });
  }, [restaurants, query, filter]);

  async function patch(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    setError(null);
    const res = await adminFetch(token, `/api/admin/restaurants/${id}`, { method: "PATCH", body: JSON.stringify(body) });
    setBusyId(null);
    if (!res.ok) setError(res.error);
    else onChanged();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="নাম, slug বা ইমেইল খুঁজুন"
          aria-label="রেস্টুরেন্ট খুঁজুন"
          className={`max-w-xs ${inputClass}`}
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          aria-label="অবস্থা অনুযায়ী ফিল্টার"
          className={`w-auto ${inputClass}`}
        >
          <option value="all">সব অবস্থা</option>
          {(Object.keys(STATE_LABEL) as SubscriptionState[]).map((s) => (
            <option key={s} value={s}>
              {STATE_LABEL[s]}
            </option>
          ))}
        </select>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="ml-auto rounded-lg bg-brand-500 px-4 py-2 text-sm font-bold text-white hover:bg-brand-600"
        >
          {showCreate ? "বন্ধ করুন" : "+ নতুন রেস্টুরেন্ট"}
        </button>
      </div>

      {showCreate && (
        <CreateForm
          token={token}
          onCreated={(c) => {
            setCreated(c);
            setShowCreate(false);
            onChanged();
          }}
        />
      )}

      {created && (
        <div role="status" className="rounded-2xl border border-green-300 bg-green-50 p-5">
          <p className="font-bold text-green-900">✓ “{created.name}” তৈরি হয়েছে</p>
          <p className="mt-1 text-sm text-green-900">
            স্পিন লিংক: <code>/r/{created.slug}</code> · মালিক: {created.ownerEmail}
          </p>
          {created.tempPassword ? (
            <div className="mt-3 rounded-lg bg-white p-3">
              <p className="text-xs text-slate-500">অস্থায়ী পাসওয়ার্ড (শুধু এখন একবারই দেখানো হচ্ছে — মালিককে পাঠিয়ে দিন, তিনি ড্যাশবোর্ডে গিয়ে বদলে নেবেন)</p>
              <div className="mt-1 flex items-center gap-3">
                <code className="select-all text-lg font-bold tracking-wider">{created.tempPassword}</code>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(created.tempPassword ?? "");
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    } catch {
                      /* ক্লিপবোর্ড ব্লক — হাতে কপি করুন */
                    }
                  }}
                  className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold hover:bg-slate-50"
                >
                  {copied ? "কপি হয়েছে ✓" : "কপি"}
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-green-900">এই ইমেইলে আগে থেকেই অ্যাকাউন্ট ছিল, তাই পাসওয়ার্ড অপরিবর্তিত।</p>
          )}
          <button onClick={() => setCreated(null)} className="mt-3 text-sm font-semibold text-green-900 underline">
            লুকান
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">রেস্টুরেন্ট</th>
              <th className="px-4 py-3">মালিক</th>
              <th className="px-4 py-3">প্ল্যান</th>
              <th className="px-4 py-3">অবস্থা</th>
              <th className="px-4 py-3 text-right">স্পিন</th>
              <th className="px-4 py-3 text-right">কাজ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  কোনো রেস্টুরেন্ট পাওয়া যায়নি
                </td>
              </tr>
            )}
            {rows.map(({ r, state }) => {
              const left = daysLeft(r.service_until);
              const busy = busyId === r.id;
              return (
                <tr key={r.id} className={busy ? "opacity-60" : undefined}>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{r.name}</p>
                    <a
                      href={`/r/${r.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-brand-700 hover:underline"
                    >
                      /r/{r.slug}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.owner_email ?? "—"}</td>
                  <td className="px-4 py-3">
                    <select
                      value={r.plan}
                      disabled={busy}
                      onChange={(e) => void patch(r.id, { plan: e.target.value })}
                      aria-label={`${r.name}-এর প্ল্যান`}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
                    >
                      {PLAN_KEYS.map((p) => (
                        <option key={p} value={p}>
                          {PLAN_LABEL[p]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${STATE_STYLE[state]}`}>
                      {STATE_LABEL[state]}
                    </span>
                    <p className="mt-1 text-xs text-slate-500">
                      {state === "suspended"
                        ? `মেয়াদ ${formatDate(r.service_until)}`
                        : left > 0
                          ? `${left.toLocaleString("bn-BD")} দিন বাকি (${formatDate(r.service_until)})`
                          : `শেষ হয়েছে ${formatDate(r.service_until)}`}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{Number(r.spins).toLocaleString("bn-BD")}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => onPay(r.id)}
                        className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-green-700"
                      >
                        পেমেন্ট নিন
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => {
                          const next = !r.is_active;
                          const msg = next
                            ? `“${r.name}” আবার চালু করবেন?`
                            : `“${r.name}” স্থগিত করবেন? স্পিন পেজ ও মালিকের ড্যাশবোর্ড বন্ধ হবে (ডেটা মুছবে না)।`;
                          if (window.confirm(msg)) void patch(r.id, { is_active: next });
                        }}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        {r.is_active ? "স্থগিত" : "চালু করুন"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">{rows.length.toLocaleString("bn-BD")}টি রেস্টুরেন্ট দেখানো হচ্ছে</p>
    </div>
  );
}
