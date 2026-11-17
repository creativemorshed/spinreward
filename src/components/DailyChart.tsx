import type { DailyPoint } from "@/lib/types";

/** কোনো লাইব্রেরি ছাড়া হালকা বার-চার্ট: কমলা = স্পিন, সবুজ = রিডিম */
export default function DailyChart({ data }: { data: DailyPoint[] }) {
  const max = Math.max(1, ...data.map((d) => d.spins));
  const total = data.reduce((s, d) => s + d.spins, 0);

  return (
    <figure className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <figcaption className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-bold text-slate-900">দৈনিক অ্যানালিটিক্স (শেষ {data.length} দিন)</span>
        <span className="flex gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <i className="inline-block h-2.5 w-2.5 rounded-sm bg-brand-500" /> স্পিন
          </span>
          <span className="flex items-center gap-1">
            <i className="inline-block h-2.5 w-2.5 rounded-sm bg-green-600" /> রিডিম
          </span>
        </span>
      </figcaption>

      {total === 0 ? (
        <p className="py-12 text-center text-slate-400">এখনও কোনো স্পিন হয়নি। QR কোড প্রিন্ট করে টেবিলে বসান!</p>
      ) : (
        <div className="mt-6 flex h-48 items-end gap-1 sm:gap-2" role="list">
          {data.map((d) => {
            const spinH = (d.spins / max) * 100;
            const redeemH = (d.redemptions / max) * 100;
            const [, m, day] = d.day.split("-");
            return (
              <div
                key={d.day}
                role="listitem"
                className="group flex h-full min-w-0 flex-1 flex-col justify-end"
                title={`${day}/${m}: ${d.spins} স্পিন, ${d.redemptions} রিডিম`}
              >
                <span className="mb-1 text-center text-[10px] font-semibold text-slate-500">{d.spins || ""}</span>
                <div className="flex flex-1 items-end justify-center gap-px">
                  <div
                    className="w-full max-w-[18px] rounded-t bg-brand-500 transition-all group-hover:bg-brand-600"
                    style={{ height: `${spinH}%`, minHeight: d.spins ? 3 : 0 }}
                  />
                  <div
                    className="w-full max-w-[18px] rounded-t bg-green-600"
                    style={{ height: `${redeemH}%`, minHeight: d.redemptions ? 3 : 0 }}
                  />
                </div>
                <span className="mt-1 text-center text-[10px] text-slate-400">
                  {day}/{m}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </figure>
  );
}
