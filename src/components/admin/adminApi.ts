import type { SubscriptionState } from "@/lib/plans";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

/** অ্যাডমিন API-র জন্য fetch র‍্যাপার: সবসময় Bearer টোকেন পাঠায়, কখনও throw করে না */
export async function adminFetch<T>(token: string, path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      ...init,
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) return { ok: false, status: res.status, error: json.error ?? `ত্রুটি (${res.status})` };
    return { ok: true, data: json };
  } catch {
    return { ok: false, status: 0, error: "ইন্টারনেট সংযোগ পরীক্ষা করুন" };
  }
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("bn-BD", { day: "numeric", month: "short", year: "numeric" });
}

export const STATE_STYLE: Record<SubscriptionState, string> = {
  trial: "bg-sky-100 text-sky-800",
  active: "bg-green-100 text-green-800",
  expiring: "bg-amber-100 text-amber-800",
  expired: "bg-red-100 text-red-800",
  suspended: "bg-slate-200 text-slate-700",
};

export const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
