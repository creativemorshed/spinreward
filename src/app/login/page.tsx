"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { getBrowserClient } from "@/lib/supabase-browser";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { error: signInError } = await getBrowserClient().auth.signInWithPassword({ email, password });
      if (signInError) {
        setError("ইমেইল বা পাসওয়ার্ড সঠিক নয়");
        return;
      }
      router.replace("/dashboard");
    } catch {
      setError("লগইন করা যায়নি, ইন্টারনেট পরীক্ষা করুন");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <h1 className="text-center text-3xl font-extrabold text-brand-600">🎡 SpinReward</h1>
      <p className="mt-1 text-center text-slate-600">রেস্টুরেন্ট ড্যাশবোর্ডে লগইন</p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">ইমেইল</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">পাসওয়ার্ড</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </label>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-brand-500 px-4 py-3 font-bold text-white transition enabled:hover:bg-brand-600 disabled:opacity-60"
        >
          {loading ? "অপেক্ষা করুন…" : "লগইন"}
        </button>
      </form>
    </main>
  );
}
