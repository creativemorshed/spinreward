"use client";

import { useState, type FormEvent } from "react";
import { getBrowserClient } from "@/lib/supabase-browser";

/** মালিক অস্থায়ী পাসওয়ার্ড বদলে নিজের পাসওয়ার্ড দেবেন */
export default function ChangePassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (password.length < 8) {
      setMessage({ ok: false, text: "পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে" });
      return;
    }
    if (password !== confirm) {
      setMessage({ ok: false, text: "দুটি পাসওয়ার্ড মেলেনি" });
      return;
    }
    setLoading(true);
    try {
      const { error } = await getBrowserClient().auth.updateUser({ password });
      if (error) setMessage({ ok: false, text: "পাসওয়ার্ড বদলানো যায়নি, আবার লগইন করে চেষ্টা করুন" });
      else {
        setMessage({ ok: true, text: "✓ পাসওয়ার্ড বদলানো হয়েছে" });
        setPassword("");
        setConfirm("");
      }
    } catch {
      setMessage({ ok: false, text: "ইন্টারনেট সংযোগ পরীক্ষা করুন" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <details className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <summary className="cursor-pointer font-bold text-slate-900">পাসওয়ার্ড পরিবর্তন</summary>
      <form onSubmit={submit} className="mt-4 grid gap-3 sm:max-w-sm">
        <input
          type="password"
          autoComplete="new-password"
          placeholder="নতুন পাসওয়ার্ড (৮+ অক্ষর)"
          aria-label="নতুন পাসওয়ার্ড"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
        <input
          type="password"
          autoComplete="new-password"
          placeholder="আবার লিখুন"
          aria-label="পাসওয়ার্ড নিশ্চিত করুন"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
        {message && (
          <p role="status" className={`rounded-lg px-3 py-2 text-sm ${message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
            {message.text}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white enabled:hover:bg-slate-700 disabled:opacity-60"
        >
          {loading ? "অপেক্ষা করুন…" : "পাসওয়ার্ড বদলান"}
        </button>
      </form>
    </details>
  );
}
