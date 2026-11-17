import DailyChart from "@/components/DailyChart";
import StatCard from "@/components/StatCard";
import { formatTaka } from "@/lib/plans";
import type { AdminStatsResponse } from "@/lib/types";

const bn = (n: number) => n.toLocaleString("bn-BD");

function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("bn-BD", { month: "short" });
}

export default function OverviewTab({ data }: { data: AdminStatsResponse }) {
  const { stats, mrr } = data;
  const maxRevenue = Math.max(1, ...stats.revenue_by_month.map((m) => Number(m.amount)));

  return (
    <div className="space-y-6">
      <section aria-label="আয়" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="মাসিক পুনরাবৃত্ত আয় (MRR)" value={formatTaka(mrr)} hint="পেমেন্টকারী সক্রিয় রেস্টুরেন্ট × প্ল্যানের দাম" />
        <StatCard label="এই মাসের আয়" value={formatTaka(Number(stats.revenue_month))} />
        <StatCard label="মোট আয়" value={formatTaka(Number(stats.revenue_total))} />
        <StatCard
          label="পেমেন্টকারী রেস্টুরেন্ট"
          value={bn(stats.restaurants_paying)}
          hint={`মোট ${bn(stats.restaurants_total)}টির মধ্যে`}
        />
      </section>

      <section aria-label="সাবস্ক্রিপশনের অবস্থা" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="ট্রায়ালে" value={bn(stats.restaurants_trial)} />
        <StatCard label="৭ দিনে মেয়াদ শেষ" value={bn(stats.expiring_soon)} hint="নবায়নের তাগাদা দিন" />
        <StatCard label="মেয়াদ শেষ" value={bn(stats.restaurants_expired)} hint="স্পিন পেজ বন্ধ" />
        <StatCard label="স্থগিত" value={bn(stats.restaurants_suspended)} />
      </section>

      <section aria-label="ব্যবহার" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="মোট স্পিন" value={bn(stats.total_spins)} />
        <StatCard label="মোট কুপন" value={bn(stats.total_coupons)} />
        <StatCard
          label="মোট রিডিম"
          value={bn(stats.total_redemptions)}
          hint={
            stats.total_coupons > 0 ? `রিডিম হার ${Math.round((stats.total_redemptions / stats.total_coupons) * 100)}%` : undefined
          }
        />
        <StatCard
          label="মোট ভিজিটর"
          value={bn(stats.total_visitors)}
          hint={`শেয়ার থেকে ${bn(stats.referred_visitors)} জন`}
        />
      </section>

      <DailyChart data={stats.daily} />

      <section className="grid gap-6 md:grid-cols-2">
        <figure className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <figcaption className="font-bold text-slate-900">মাসিক আয় (শেষ ৬ মাস)</figcaption>
          <div className="mt-5 flex h-40 items-end gap-2" role="list">
            {stats.revenue_by_month.map((m) => (
              <div key={m.month} role="listitem" className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${m.month}: ${formatTaka(Number(m.amount))}`}>
                <span className="mb-1 truncate text-center text-[10px] font-semibold text-slate-500">
                  {Number(m.amount) > 0 ? formatTaka(Number(m.amount)) : ""}
                </span>
                <div
                  className="w-full rounded-t bg-green-600"
                  style={{ height: `${(Number(m.amount) / maxRevenue) * 100}%`, minHeight: Number(m.amount) > 0 ? 3 : 0 }}
                />
                <span className="mt-1 text-center text-[10px] text-slate-400">{monthLabel(m.month)}</span>
              </div>
            ))}
          </div>
        </figure>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-bold text-slate-900">শীর্ষ রেস্টুরেন্ট (শেষ ৩০ দিনের স্পিন)</h2>
          {stats.top_restaurants.length === 0 ? (
            <p className="py-8 text-center text-slate-400">এখনও কোনো স্পিন নেই</p>
          ) : (
            <ol className="mt-4 space-y-3">
              {stats.top_restaurants.map((r, i) => (
                <li key={r.slug} className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
                      {bn(i + 1)}
                    </span>
                    <span className="truncate font-medium text-slate-800">{r.name}</span>
                  </span>
                  <span className="shrink-0 font-bold text-slate-900">{bn(Number(r.spins))}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </div>
  );
}
