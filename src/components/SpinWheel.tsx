"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicReward, ShareResponse, SpinResponse, VisitorResponse } from "@/lib/types";
import { STEP, polar, segmentPath, targetRotation } from "@/lib/wheel";

const SIZE = 400;
const C = SIZE / 2;
const R = 190;
const SPIN_MS = 5200;

interface Props {
  slug: string;
  restaurantName: string;
  rewards: PublicReward[];
}

interface StoredWin {
  code: string;
  label: string;
  discountAmount: number;
  expiresAt: string;
}

type Outcome =
  | { kind: "win"; label: string; code: string; discountAmount: number; expiresAt: string }
  | { kind: "lose" };

const storageKey = (slug: string) => `sr:win:${slug}`;

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode — উপেক্ষা */
  }
}

function getVisitorId(): string {
  let id = safeGet("sr:visitor");
  if (!id || id.length < 8) {
    id = crypto.randomUUID();
    safeSet("sr:visitor", id);
  }
  return id;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("bn-BD", { day: "numeric", month: "long", year: "numeric" });
}

export default function SpinWheel({ slug, restaurantName, rewards }: Props) {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savedWin, setSavedWin] = useState<StoredWin | null>(null);

  // ভাইরাল লুপের অবস্থা
  const [ready, setReady] = useState(false);
  const [freeSpin, setFreeSpin] = useState(true);
  const [bonusSpins, setBonusSpins] = useState(0);
  const [refCode, setRefCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const pending = useRef<Outcome | null>(null);
  const spinsLeft = (freeSpin ? 1 : 0) + bonusSpins;

  // পেজ লোড: ভিজিটর নিবন্ধন, শেয়ার-লিংকের ?ref পাঠানো, কতগুলো স্পিন বাকি জানা
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/visitor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, visitorId: getVisitorId(), ref }),
        });
        if (res.ok && !cancelled) {
          const data = (await res.json()) as VisitorResponse;
          setRefCode(data.refCode);
          setBonusSpins(data.bonusSpins);
          setFreeSpin(data.freeSpinAvailable);
        }
      } catch {
        /* নেটওয়ার্ক সমস্যা — সার্ভার স্পিনের সময় আবার যাচাই করবে */
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  // আগের জেতা কুপন থাকলে (রিফ্রেশের পরও) দেখাও
  useEffect(() => {
    const raw = safeGet(storageKey(slug));
    if (!raw) return;
    try {
      const win = JSON.parse(raw) as StoredWin;
      if (new Date(win.expiresAt).getTime() > Date.now()) setSavedWin(win);
    } catch {
      /* নষ্ট ডেটা উপেক্ষা */
    }
  }, [slug]);

  const spin = useCallback(async () => {
    if (spinning) return;
    setError(null);
    setNotice(null);
    setSpinning(true);

    try {
      const res = await fetch("/api/spin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, visitorId: getVisitorId() }),
      });
      const data = (await res.json()) as SpinResponse & { error?: string; code?: string };
      if (!res.ok) {
        if (data.code === "NO_SPINS") {
          setFreeSpin(false);
          setBonusSpins(0);
        }
        setError(data.error ?? "কিছু একটা ভুল হয়েছে");
        setSpinning(false);
        return;
      }

      pending.current = data.coupon
        ? {
            kind: "win",
            label: data.reward.label,
            code: data.coupon.code,
            discountAmount: data.coupon.discountAmount,
            expiresAt: data.coupon.expiresAt,
          }
        : { kind: "lose" };

      // ব্যালেন্স সার্ভারের হিসাব অনুযায়ী; ফ্রি স্পিন লাগলে সেটা শেষ
      setBonusSpins(data.bonusSpins);
      if (!data.usedBonus) setFreeSpin(false);
      setRefCode(data.refCode);

      // segment-এর ভেতরে এলোমেলো জায়গায় থামে — আরও বাস্তব দেখায়
      const jitter = Math.random() - 0.5;
      setRotation((current) => targetRotation(current, data.rewardIndex, jitter));
    } catch {
      setError("ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন");
      setSpinning(false);
    }
  }, [slug, spinning]);

  const onTransitionEnd = useCallback(() => {
    if (!spinning || !pending.current) return;
    const result = pending.current;
    pending.current = null;
    setSpinning(false);
    setOutcome(result);

    if (result.kind === "win") {
      const win: StoredWin = {
        code: result.code,
        label: result.label,
        discountAmount: result.discountAmount,
        expiresAt: result.expiresAt,
      };
      safeSet(storageKey(slug), JSON.stringify(win));
      setSavedWin(win);
    }
  }, [slug, spinning]);

  const shareUrl = useCallback(() => {
    const base = `${window.location.origin}/r/${slug}`;
    return refCode ? `${base}?ref=${refCode}` : base;
  }, [slug, refCode]);

  /** Facebook শেয়ার + বোনাস স্পিন দাবি। popup আগে খুলি (ব্রাউজার ব্লক এড়াতে), তারপর বোনাস চাই। */
  const shareOnFacebook = useCallback(async () => {
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl())}`,
      "_blank",
      "noopener,noreferrer,width=600,height=500",
    );
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, visitorId: getVisitorId() }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as ShareResponse;
      setBonusSpins(data.bonusSpins);
      setNotice(
        data.granted
          ? "🎁 বোনাস স্পিন পেয়েছেন! বন্ধুরা লিংকে এসে স্পিন করলে আরও পাবেন।"
          : "আজকের শেয়ার-বোনাস আগেই নেওয়া হয়েছে। বন্ধুরা স্পিন করলে আরও বোনাস পাবেন!",
      );
    } catch {
      /* নেটওয়ার্ক সমস্যা — শেয়ার হয়ে গেছে, বোনাস পরে চেষ্টা করা যাবে */
    }
  }, [slug, shareUrl]);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ক্লিপবোর্ড ব্লক — উপেক্ষা */
    }
  }, [shareUrl]);

  // অ্যানিমেশন চলার সময় নয়, থামার পরে শেয়ার-কার্ড দেখাই
  const outOfSpins = ready && spinsLeft === 0 && !spinning;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center px-4 py-8">
      <p className="text-sm font-medium tracking-wide text-brand-700">স্বাগতম</p>
      <h1 className="mt-1 text-center text-3xl font-extrabold text-slate-900">{restaurantName}</h1>
      <p className="mt-2 text-center text-slate-600">চাকা ঘুরিয়ে জিতে নিন ক্যাশ ডিসকাউন্ট!</p>

      {/* স্পিন কাউন্টার */}
      <div
        aria-live="polite"
        className="mt-4 rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200"
      >
        {ready ? (
          <>
            🎟️ স্পিন বাকি: <span className="text-brand-700">{spinsLeft.toLocaleString("bn-BD")}</span>
            {bonusSpins > 0 && (
              <span className="text-slate-400"> (বোনাস {bonusSpins.toLocaleString("bn-BD")})</span>
            )}
          </>
        ) : (
          "লোড হচ্ছে…"
        )}
      </div>

      {/* চাকা */}
      <div className="relative mt-6 w-full max-w-[360px] select-none">
        {/* পয়েন্টার */}
        <div
          aria-hidden
          className="absolute left-1/2 top-0 z-10 h-0 w-0 -translate-x-1/2 -translate-y-1"
          style={{
            borderLeft: "16px solid transparent",
            borderRight: "16px solid transparent",
            borderTop: "30px solid #0f172a",
            filter: "drop-shadow(0 2px 2px rgba(0,0,0,.35))",
          }}
        />

        <div
          className="aspect-square w-full rounded-full border-[10px] border-slate-900 bg-slate-900 shadow-2xl"
          style={{
            transform: `rotate(${rotation}deg)`,
            // শুরুতে দ্রুত, শেষে ধীরে ধীরে থামে (ease-out)
            transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(0.12, 0.6, 0.08, 1)` : "none",
            willChange: "transform",
          }}
          onTransitionEnd={onTransitionEnd}
          role="img"
          aria-label="স্পিন হুইল"
        >
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-full w-full">
            {rewards.map((reward, i) => {
              const mid = i * STEP + STEP / 2;
              const [lx, ly] = polar(C, C, R * 0.64, mid);
              const isLong = reward.label.length > 5;
              return (
                <g key={reward.position}>
                  <path d={segmentPath(C, C, R, i)} fill={reward.color} stroke="#fff" strokeWidth={3} />
                  <text
                    x={lx}
                    y={ly}
                    transform={`rotate(${mid} ${lx} ${ly})`}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#fff"
                    fontWeight={800}
                    fontSize={isLong ? 17 : 26}
                    style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,.25)", strokeWidth: 3 }}
                  >
                    {reward.label}
                  </text>
                </g>
              );
            })}
            {/* মাঝের বোতাম */}
            <circle cx={C} cy={C} r={30} fill="#0f172a" stroke="#fff" strokeWidth={4} />
            <circle cx={C} cy={C} r={8} fill="#f97316" />
          </svg>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-6 w-full max-w-[360px] rounded-xl bg-red-50 px-4 py-3 text-center text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-6 w-full max-w-[360px] rounded-xl bg-green-50 px-4 py-3 text-center text-sm text-green-800">
          {notice}
        </p>
      )}

      {outOfSpins ? (
        /* স্পিন শেষ — ভাইরাল লুপের মূল জায়গা */
        <section className="mt-6 w-full max-w-[360px] rounded-2xl border-2 border-dashed border-[#1877f2] bg-white p-5 text-center shadow-sm">
          <p className="text-lg font-extrabold text-slate-900">আরও স্পিন চান? 🎁</p>
          <p className="mt-1 text-sm text-slate-600">
            Facebook-এ শেয়ার করলে <b>+১ বোনাস স্পিন</b>। বন্ধু আপনার লিংকে এসে স্পিন করলে আরও <b>+১</b>!
          </p>
          <button
            type="button"
            onClick={shareOnFacebook}
            className="mt-4 w-full rounded-xl bg-[#1877f2] px-4 py-3 font-bold text-white transition hover:brightness-110"
          >
            Facebook-এ শেয়ার করুন
          </button>
          <button
            type="button"
            onClick={copyLink}
            className="mt-2 w-full rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            {copied ? "লিংক কপি হয়েছে ✓" : "লিংক কপি করুন"}
          </button>
        </section>
      ) : (
        <button
          type="button"
          onClick={spin}
          disabled={spinning || !ready}
          className="mt-8 w-full max-w-[360px] rounded-2xl bg-brand-500 px-6 py-4 text-xl font-extrabold text-white shadow-lg transition active:scale-[0.98] enabled:hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {spinning ? "ঘুরছে…" : "স্পিন করুন!"}
        </button>
      )}

      {/* আগে জেতা কুপন */}
      {savedWin && !outcome && (
        <section className="mt-8 w-full max-w-[360px] rounded-2xl border border-dashed border-brand-500 bg-brand-50 p-5 text-center">
          <p className="text-sm text-slate-600">আপনার কুপন (ক্যাশিয়ারকে দেখান)</p>
          <p className="mt-1 text-4xl font-black tracking-widest text-slate-900">{savedWin.code}</p>
          <p className="mt-1 font-semibold text-brand-700">৳{savedWin.discountAmount} ডিসকাউন্ট</p>
          <p className="mt-1 text-xs text-slate-500">মেয়াদ: {formatDate(savedWin.expiresAt)} পর্যন্ত</p>
        </section>
      )}

      {/* রিওয়ার্ড স্ক্রিন */}
      {outcome && (
        <div
          className="fixed inset-0 z-20 flex items-end justify-center bg-slate-900/70 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reward-title"
        >
          <div className="w-full max-w-sm animate-pop rounded-3xl bg-white p-6 text-center shadow-2xl">
            {outcome.kind === "win" ? (
              <>
                <p className="text-5xl" aria-hidden>
                  🎉
                </p>
                <h2 id="reward-title" className="mt-2 text-2xl font-extrabold text-slate-900">
                  অভিনন্দন! আপনি জিতেছেন
                </h2>
                <p className="mt-1 text-5xl font-black text-brand-600">৳{outcome.discountAmount}</p>
                <p className="text-slate-600">ক্যাশ ডিসকাউন্ট</p>

                <div className="mt-5 rounded-2xl border-2 border-dashed border-brand-500 bg-brand-50 p-4">
                  <p className="text-xs text-slate-500">কুপন কোড</p>
                  <p className="mt-1 text-3xl font-black tracking-[0.25em] text-slate-900">{outcome.code}</p>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  বিল দেওয়ার সময় ক্যাশিয়ারকে দেখান · মেয়াদ {formatDate(outcome.expiresAt)} পর্যন্ত
                </p>
              </>
            ) : (
              <>
                <p className="text-5xl" aria-hidden>
                  😅
                </p>
                <h2 id="reward-title" className="mt-2 text-2xl font-extrabold text-slate-900">
                  এবার হলো না!
                </h2>
                <p className="mt-2 text-slate-600">শেয়ার করে বোনাস স্পিন নিয়ে আবার চেষ্টা করুন।</p>
              </>
            )}

            <button
              type="button"
              onClick={shareOnFacebook}
              className="mt-5 w-full rounded-xl bg-[#1877f2] px-4 py-3 font-bold text-white transition hover:brightness-110"
            >
              Facebook-এ শেয়ার করে বোনাস স্পিন নিন
            </button>
            {notice && (
              <p role="status" className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
                {notice}
              </p>
            )}

            <button
              type="button"
              onClick={() => setOutcome(null)}
              className="mt-3 w-full rounded-xl px-4 py-3 font-semibold text-slate-600 hover:bg-slate-100"
            >
              বন্ধ করুন
            </button>
          </div>
        </div>
      )}

      <p className="mt-auto pt-10 text-xs text-slate-400">প্রতিদিন ১টি ফ্রি স্পিন · শেয়ার করে আরও বোনাস</p>
    </main>
  );
}
