export const isValidSlug = (v: unknown): v is string => typeof v === "string" && /^[a-z0-9-]{3,40}$/.test(v);

export const isValidVisitorId = (v: unknown): v is string => typeof v === "string" && v.length >= 8 && v.length <= 64;

/** ঢাকার সময় অনুযায়ী আজকের তারিখ (YYYY-MM-DD) — DB-র spin_day-র সাথে মিলতে হবে */
export function todayInDhaka(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(now);
}
