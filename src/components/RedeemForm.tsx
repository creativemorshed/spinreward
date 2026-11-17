"use client";

import { useState, type FormEvent } from "react";

interface Props {
  getToken: () => Promise<string | null>;
  onRedeemed: () => void;
}

export default function RedeemForm({ getToken, onRedeemed }: Props) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const token = await getToken();
      if (!token) {
        setMessage({ ok: false, text: "সেশন শেষ, আবার লগইন করুন" });
        return;
      }
      const res = await fetch("/api/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code }),
      });
      const data = (await res.json()) as { ok?: boolean; discountAmount?: number; error?: string };
      if (res.ok && data.ok) {
        setMessage({ ok: true, text: `✓ কুপন বৈধ — বিল থেকে ৳${data.discountAmount} ছাড় দিন` });
        setCode("");
        onRedeemed();
      } else {
        setMessage({ ok: false, text: data.error ?? "রিডিম করা যায়নি" });
      }
    } catch {
      setMessage({ ok: false, text: "ইন্টারনেট সংযোগ পরীক্ষা করুন" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-bold text-slate-900">কুপন রিডিম (ক্যাশিয়ার)</h2>
      <p className="mt-1 text-sm text-slate-500">কাস্টমারের দেখানো ৮ অক্ষরের কোড লিখুন।</p>
      <div className="mt-4 flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={12}
          placeholder="XXXXXXXX"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          aria-label="কুপন কোড"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 font-mono text-lg tracking-widest outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
        <button
          type="submit"
          disabled={loading || code.trim().length < 8}
          className="rounded-lg bg-green-600 px-4 py-2 font-bold text-white transition enabled:hover:bg-green-700 disabled:opacity-50"
        >
          {loading ? "…" : "রিডিম"}
        </button>
      </div>
      {message && (
        <p
          role="status"
          className={`mt-3 rounded-lg px-3 py-2 text-sm ${
            message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </p>
      )}
    </form>
  );
}
