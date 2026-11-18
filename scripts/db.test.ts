/**
 * আসল Postgres (pglite = WASM) দিয়ে schema.sql ও 002_viral_loop.sql টেস্ট।
 * Supabase-এর auth.users ও role-গুলোর ছোট স্টাব বানিয়ে নেওয়া হয়।
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const read = (f: string) =>
  readFileSync(join(__dirname, "..", "supabase", f), "utf8").replace(/create extension if not exists pgcrypto;/g, "");

async function expectError(p: Promise<unknown>, pattern: RegExp, label: string) {
  try {
    await p;
  } catch (e) {
    assert.match(String((e as Error).message), pattern, label);
    return;
  }
  assert.fail(`${label}: error আশা করা হয়েছিল`);
}

async function main() {
  const db = new PGlite();
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text);
    create role anon; create role authenticated; create role service_role;
  `);

  // দুইবার চালিয়ে idempotency যাচাই
  await db.exec(read("schema.sql"));
  await db.exec(read("002_viral_loop.sql"));
  await db.exec(read("002_viral_loop.sql"));
  await db.exec(read("003_admin_panel.sql"));
  await db.exec(read("003_admin_panel.sql"));
  await db.exec(read("004_payments_reminders_antifraud.sql"));
  await db.exec(read("004_payments_reminders_antifraud.sql"));
  console.log("✓ schema.sql + 002 + 003 + 004 চলেছে (মাইগ্রেশন idempotent)");

  const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    (await db.query<T>(sql, params)).rows;

  // ---- রেস্টুরেন্ট ও ডিফল্ট ৮ reward ----
  const [user] = await q<{ id: string }>("insert into auth.users default values returning id");
  const [rest] = await q<{ id: string }>(
    "insert into restaurants (owner_id, name, slug, plan) values ($1, 'Sampan', 'sampan', 'standard') returning id",
    [user.id],
  );
  const rewards = await q<{ position: number; weight: number; discount_amount: number }>(
    "select position, weight, discount_amount from rewards where restaurant_id=$1 order by position",
    [rest.id],
  );
  assert.equal(rewards.length, 8);
  assert.deepEqual(rewards.map((r) => r.position), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(rewards.filter((r) => r.discount_amount === 0).length, 2);
  await expectError(
    q("insert into restaurants (name, slug) values ('x', 'Bad Slug!')"),
    /check|violates/i,
    "অবৈধ slug",
  );
  console.log("✓ রেস্টুরেন্ট তৈরিতে ৮টি ডিফল্ট reward অটো তৈরি; slug যাচাই কাজ করে");

  const rid = rest.id;
  const rewardId = (await q<{ id: string }>("select id from rewards where restaurant_id=$1 and position=0", [rid]))[0].id;
  const addVisitor = async (id: string, ref: string, referredBy: string | null = null) =>
    q(
      "insert into visitors (restaurant_id, visitor_id, ref_code, referred_by_visitor) values ($1,$2,$3,$4)",
      [rid, id, ref, referredBy],
    );
  const bonusOf = async (id: string) =>
    (await q<{ bonus_spins: number }>("select bonus_spins from visitors where restaurant_id=$1 and visitor_id=$2", [rid, id]))[0]
      .bonus_spins;
  const addSpin = (id: string, bonus = false) =>
    q("insert into spins (restaurant_id, reward_id, visitor_id, is_bonus) values ($1,$2,$3,$4)", [rid, rewardId, id, bonus]);

  // ---- দিনে ১ ফ্রি স্পিন; বোনাস স্পিন আলাদা ----
  await addSpin("visitor-aaaa");
  await expectError(addSpin("visitor-aaaa"), /duplicate key|unique/i, "দ্বিতীয় ফ্রি স্পিন");
  await addSpin("visitor-aaaa", true);
  await addSpin("visitor-aaaa", true);
  await addSpin("visitor-bbbb"); // অন্য ভিজিটর ঠিকই পারে
  console.log("✓ দিনে ১টি ফ্রি স্পিন (unique index); বোনাস স্পিন সীমার বাইরে");

  // ---- বোনাস খরচ ----
  await addVisitor("visitor-aaaa", "aaaaaaaa22"); // রেফারার
  assert.equal((await q<{ r: boolean }>("select consume_bonus_spin($1,$2) as r", [rid, "visitor-aaaa"]))[0].r, false);
  await q("update visitors set bonus_spins=1 where visitor_id='visitor-aaaa'");
  assert.equal((await q<{ r: boolean }>("select consume_bonus_spin($1,$2) as r", [rid, "visitor-aaaa"]))[0].r, true);
  assert.equal((await q<{ r: boolean }>("select consume_bonus_spin($1,$2) as r", [rid, "visitor-aaaa"]))[0].r, false);
  assert.equal(await bonusOf("visitor-aaaa"), 0);
  await q("select refund_bonus_spin($1,$2)", [rid, "visitor-aaaa"]);
  assert.equal(await bonusOf("visitor-aaaa"), 1);
  console.log("✓ consume_bonus_spin: ব্যালেন্স ০ হলে false, কখনও ঋণাত্মক হয় না; refund কাজ করে");

  // ---- একসাথে অনেক খরচের চেষ্টা (ব্যালেন্স ১ → মাত্র ১টি সফল) ----
  const results = await Promise.all(
    Array.from({ length: 6 }, () => q<{ r: boolean }>("select consume_bonus_spin($1,$2) as r", [rid, "visitor-aaaa"])),
  );
  assert.equal(results.filter((r) => r[0].r).length, 1);
  assert.equal(await bonusOf("visitor-aaaa"), 0);
  console.log("✓ একসাথে ৬টি রিকোয়েস্টে মাত্র ১টি বোনাস খরচ হয়");

  // ---- শেয়ার বোনাস: দিনে একবার, সীমা ৫ ----
  assert.equal((await q<{ r: boolean }>("select claim_share_bonus($1,$2) as r", [rid, "visitor-aaaa"]))[0].r, true);
  assert.equal((await q<{ r: boolean }>("select claim_share_bonus($1,$2) as r", [rid, "visitor-aaaa"]))[0].r, false);
  assert.equal(await bonusOf("visitor-aaaa"), 1);
  await q("update visitors set last_share_day = current_date - 2 where visitor_id='visitor-aaaa'");
  assert.equal((await q<{ r: boolean }>("select claim_share_bonus($1,$2) as r", [rid, "visitor-aaaa"]))[0].r, true);
  assert.equal(await bonusOf("visitor-aaaa"), 2);
  assert.equal((await q<{ r: boolean }>("select claim_share_bonus($1,$2) as r", [rid, "nobody-xxxx"]))[0].r, false);
  console.log("✓ claim_share_bonus: দিনে একবার; অচেনা ভিজিটরে false");

  // ---- রেফারেল: একবারই ক্রেডিট, দৈনিক সীমা ৩, ব্যালেন্স সীমা ৫ ----
  await q("update visitors set bonus_spins=0 where visitor_id='visitor-aaaa'");
  await addVisitor("friend-0001", "bbbbbbbb22", "visitor-aaaa");
  await addVisitor("friend-0002", "cccccccc22", "visitor-aaaa");
  await addVisitor("friend-0003", "dddddddd22", "visitor-aaaa");
  await addVisitor("friend-0004", "eeeeeeee22", "visitor-aaaa");
  await addVisitor("organic-001", "ffffffff22", null);

  const credit = async (id: string) =>
    (await q<{ r: boolean }>("select credit_referral($1,$2) as r", [rid, id]))[0].r;

  assert.equal(await credit("organic-001"), false, "রেফারার ছাড়া ভিজিটর");
  assert.equal(await credit("friend-0001"), true);
  assert.equal(await credit("friend-0001"), false, "একই ভিজিটরের জন্য দ্বিতীয়বার নয়");
  assert.equal(await bonusOf("visitor-aaaa"), 1);
  assert.equal(await credit("friend-0002"), true);
  assert.equal(await credit("friend-0003"), true);
  assert.equal(await credit("friend-0004"), false, "দৈনিক সীমা ৩ পেরিয়েছে");
  assert.equal(await bonusOf("visitor-aaaa"), 3);
  console.log("✓ credit_referral: একবারই ক্রেডিট, রেফারার ছাড়া false, দৈনিক সীমা ৩");

  await q("update visitors set bonus_spins=5 where visitor_id='visitor-aaaa'");
  await q("select refund_bonus_spin($1,$2)", [rid, "visitor-aaaa"]);
  assert.equal(await bonusOf("visitor-aaaa"), 5, "সর্বোচ্চ ৫");
  await expectError(q("update visitors set bonus_spins=6 where visitor_id='visitor-aaaa'"), /check|violates/i, "৬ নিষিদ্ধ");
  await expectError(addVisitor("dup-ref-0001", "aaaaaaaa22"), /duplicate key|unique/i, "ref_code অনন্য");
  await expectError(addVisitor("bad-ref-0001", "SHORT"), /check|violates/i, "ref_code ফরম্যাট");
  console.log("✓ ব্যালেন্স সীমা ৫, ref_code অনন্য ও ফরম্যাট-চেক");

  // ---- কুপন ও stats ----
  const [spin] = await q<{ id: string }>("select id from spins where visitor_id='visitor-bbbb' limit 1");
  await q(
    "insert into coupons (restaurant_id, reward_id, spin_id, code, discount_amount, expires_at, status, redeemed_at) values ($1,$2,$3,'ABCD2345',50, now()+interval '7 days','redeemed', now())",
    [rid, rewardId, spin.id],
  );
  const [{ stats }] = await q<{ stats: any }>("select restaurant_stats($1, 14) as stats", [rid]);
  assert.equal(stats.total_spins, 4);
  assert.equal(stats.total_coupons, 1);
  assert.equal(stats.total_redemptions, 1);
  assert.equal(stats.total_visitors, 6);
  assert.equal(stats.referred_visitors, 4);
  assert.equal(stats.bonus_spins_used, 2);
  assert.equal(stats.most_won.label, "৳50");
  assert.equal(stats.most_won.wins, 4);
  assert.equal(stats.daily.length, 14);
  assert.equal(stats.daily[13].spins, 4);
  assert.equal(stats.daily[13].redemptions, 1);
  assert.equal(stats.daily[0].spins, 0);
  const [{ stats: s7 }] = await q<{ stats: any }>("select restaurant_stats($1, 7) as stats", [rid]);
  assert.equal(s7.daily.length, 7);
  console.log("✓ restaurant_stats: সব সংখ্যা ও ১৪/৭ দিনের চার্ট ডেটা সঠিক");

  // ---- অন্য রেস্টুরেন্টের ডেটা মেশে না ----
  const [rest2] = await q<{ id: string }>("insert into restaurants (name, slug) values ('Other', 'other-rest') returning id");
  const [{ stats: other }] = await q<{ stats: any }>("select restaurant_stats($1, 14) as stats", [rest2.id]);
  assert.equal(other.total_spins, 0);
  assert.equal(other.most_won, null);
  assert.equal(other.total_visitors, 0);
  console.log("✓ রেস্টুরেন্টভেদে ডেটা আলাদা");

  // ================= Admin Panel (migration 003) =================
  const daysLeft = async (id: string) =>
    Number(
      (await q<{ d: string }>("select extract(epoch from (service_until - now())) / 86400 as d from restaurants where id=$1", [id]))[0].d,
    );
  const planOf = async (id: string) =>
    (await q<{ plan: string }>("select plan from restaurants where id=$1", [id]))[0].plan;
  const pay = (
    restaurant: string,
    amount: number,
    plan: string,
    method: string,
    reference: string | null,
    days = 30,
    note: string | null = null,
  ) =>
    q<{ r: { payment_id: string; service_until: string } }>(
      "select record_payment($1,$2,$3,$4,$5,$6,$7,$8) as r",
      [restaurant, amount, plan, method, reference, days, note, user.id],
    );

  // নতুন রেস্টুরেন্টের ডিফল্ট = ১৪ দিন ট্রায়াল
  const trialDays = await daysLeft(rest2.id);
  assert.ok(trialDays > 13.9 && trialDays <= 14.01, `trial=${trialDays}`);
  console.log("✓ নতুন রেস্টুরেন্ট = ১৪ দিন ট্রায়াল");

  // মেয়াদ শেষ অবস্থা থেকে পেমেন্ট → আজ থেকে গোনা
  await q("update restaurants set service_until = now() - interval '2 days' where id=$1", [rid]);
  await pay(rid, 999, "standard", "bkash", "TRX001");
  let d = await daysLeft(rid);
  assert.ok(d > 29.9 && d < 30.1, `expired→paid: ${d}`);
  assert.equal(await planOf(rid), "standard");

  // বাকি মেয়াদ থাকতে পেমেন্ট → বাকি দিন হারায় না (৩০ + ৩০)
  await pay(rid, 1999, "premium", "nagad", "TRX001"); // একই আইডি, ভিন্ন মাধ্যম = বৈধ
  d = await daysLeft(rid);
  assert.ok(d > 59.9 && d < 60.1, `extend: ${d}`);
  assert.equal(await planOf(rid), "premium");
  console.log("✓ record_payment: মেয়াদ শেষ হলে আজ থেকে, বাকি থাকলে তার উপরে যোগ; প্ল্যান বদলায়");

  await expectError(pay(rid, 999, "standard", "bkash", "TRX001"), /duplicate key|unique/i, "ডুপ্লিকেট TrxID");
  await pay(rid, 500, "basic", "cash", null, 10);
  await pay(rid, 500, "basic", "cash", null, 10); // reference ছাড়া একাধিক ক্যাশ ঠিক আছে
  await expectError(pay(rid, 0, "basic", "cash", null), /check|violates/i, "amount ০");
  await expectError(pay(rid, 100, "gold", "cash", null), /check|violates/i, "অবৈধ প্ল্যান");
  await expectError(pay(rid, 100, "basic", "paypal", null), /check|violates/i, "অবৈধ মাধ্যম");
  await expectError(pay(rid, 100, "basic", "cash", null, 0), /check|violates/i, "period ০");
  await expectError(pay("00000000-0000-0000-0000-000000000000", 100, "basic", "cash", null), /not found/i, "অচেনা রেস্টুরেন্ট");
  const payCount = (await q<{ c: string }>("select count(*) c from payments where restaurant_id=$1", [rid]))[0].c;
  assert.equal(Number(payCount), 4, "ব্যর্থ চেষ্টায় কোনো এন্ট্রি জমেনি");
  d = await daysLeft(rid);
  assert.ok(d > 79.9 && d < 80.1, `after cash x2: ${d}`);
  console.log("✓ ডুপ্লিকেট TrxID, অবৈধ ইনপুট ঠেকায়; ব্যর্থ পেমেন্টে মেয়াদ/খাতা অপরিবর্তিত");

  await expectError(q("delete from restaurants where id=$1", [rid]), /foreign key|violates/i, "পেমেন্টসহ রেস্টুরেন্ট মোছা");
  console.log("✓ পেমেন্টের ইতিহাস থাকা রেস্টুরেন্ট মোছা যায় না");

  // ---- platform_stats ----
  await q("update restaurants set service_until = now() + interval '3 days' where id=$1", [rid]); // শীঘ্রই শেষ
  let [{ s }] = await q<{ s: any }>("select platform_stats(14) as s");
  assert.equal(s.restaurants_total, 2);
  assert.equal(s.restaurants_paying, 1);
  assert.equal(s.restaurants_trial, 1);
  assert.equal(s.restaurants_expired, 0);
  assert.equal(s.restaurants_suspended, 0);
  assert.equal(s.expiring_soon, 1);
  assert.equal(s.paying_by_plan.basic, 1, "শেষ পেমেন্টের প্ল্যান (basic) কার্যকর");
  assert.equal(s.paying_by_plan.standard, 0);
  assert.equal(s.paying_by_plan.premium, 0);
  assert.equal(Number(s.revenue_total), 999 + 1999 + 500 + 500);
  assert.equal(Number(s.revenue_month), 999 + 1999 + 500 + 500);
  assert.equal(s.revenue_by_month.length, 6);
  assert.equal(Number(s.revenue_by_month[5].amount), 3998);
  assert.equal(Number(s.revenue_by_month[0].amount), 0);
  assert.equal(s.total_spins, 4);
  assert.equal(s.total_visitors, 6);
  assert.equal(s.daily.length, 14);
  assert.equal(s.top_restaurants.length, 1);
  assert.equal(s.top_restaurants[0].slug, "sampan");
  assert.equal(Number(s.top_restaurants[0].spins), 4);

  await q("update restaurants set service_until = now() - interval '1 day' where id=$1", [rest2.id]);
  [{ s }] = await q<{ s: any }>("select platform_stats(14) as s");
  assert.equal(s.restaurants_expired, 1);
  assert.equal(s.restaurants_trial, 0);
  await q("update restaurants set is_active=false where id=$1", [rest2.id]);
  [{ s }] = await q<{ s: any }>("select platform_stats(14) as s");
  assert.equal(s.restaurants_suspended, 1);
  assert.equal(s.restaurants_expired, 0, "suspended আলাদা গোনা হয়, expired-এ নয়");
  console.log("✓ platform_stats: paying/trial/expired/suspended/expiring, রাজস্ব (মোট/মাস/৬ মাস), শীর্ষ রেস্টুরেন্ট");

  // ---- admin_restaurants (মালিকের ইমেইল সহ) ----
  await q("update auth.users set email='owner@example.com' where id=$1", [user.id]);
  const [{ list }] = await q<{ list: any[] }>("select admin_restaurants() as list");
  assert.equal(list.length, 2);
  const sampan = list.find((x) => x.slug === "sampan");
  assert.equal(sampan.owner_email, "owner@example.com");
  assert.equal(Number(sampan.spins), 4);
  assert.equal(Number(sampan.payments_count), 4);
  assert.ok(sampan.last_payment_at);
  const otherRow = list.find((x) => x.slug === "other-rest");
  assert.equal(otherRow.owner_email, null);
  assert.equal(otherRow.is_active, false);
  console.log("✓ admin_restaurants: মালিকের ইমেইল, স্পিন ও পেমেন্ট সংখ্যা");

  // ---- platform_admins ----
  await q("insert into platform_admins (user_id) values ($1)", [user.id]);
  await expectError(q("insert into platform_admins (user_id) values ($1)", [user.id]), /duplicate key|unique/i, "ডুপ্লিকেট অ্যাডমিন");
  console.log("✓ platform_admins");

  // ================= Migration 004 =================

  // ---- hit_rate_limit ----
  const hit = async (key: string, windowSec: number, max: number) =>
    (await q<{ r: boolean }>("select hit_rate_limit($1,$2,$3) as r", [key, windowSec, max]))[0].r;

  assert.deepEqual([await hit("k1", 60, 3), await hit("k1", 60, 3), await hit("k1", 60, 3), await hit("k1", 60, 3)], [
    true,
    true,
    true,
    false,
  ]);
  assert.equal(await hit("k2", 60, 3), true, "অন্য key স্বাধীন");
  await q("update rate_limits set window_start = now() - interval '2 minutes' where key='k1'");
  assert.equal(await hit("k1", 60, 3), true, "জানালা পেরোলে গণনা নতুন করে শুরু");
  assert.equal((await q<{ hits: number }>("select hits from rate_limits where key='k1'"))[0].hits, 1);
  await q("update rate_limits set window_start = now() - interval '2 days' where key='k2'");
  assert.equal((await q<{ n: number }>("select purge_rate_limits() as n"))[0].n, 1);
  assert.equal(Number((await q<{ c: string }>("select count(*) c from rate_limits where key='k2'"))[0].c), 0);
  const concurrent = await Promise.all(Array.from({ length: 10 }, () => hit("k3", 60, 4)));
  assert.equal(concurrent.filter(Boolean).length, 4, "একসাথে ১০টি চেষ্টায় ঠিক ৪টি অনুমোদিত");
  console.log("✓ hit_rate_limit: সীমা, জানালা-রিসেট, আলাদা key, purge, একসাথে ১০ চেষ্টায় ঠিক ৪টি");

  // ---- IP-সচেতন রেফারেল ----
  const [rest3] = await q<{ id: string }>("insert into restaurants (name, slug) values ('IP Test', 'ip-test') returning id");
  const r3 = rest3.id;
  const v = (id: string, ref: string, by: string | null, ip: string | null, last: string | null = ip) =>
    q(
      "insert into visitors (restaurant_id, visitor_id, ref_code, referred_by_visitor, ip_hash, last_ip_hash) values ($1,$2,$3,$4,$5,$6)",
      [r3, id, ref, by, ip, last],
    );
  const credit3 = async (id: string, ip: string | null = null) =>
    (await q<{ r: boolean }>("select credit_referral($1,$2,3,$3) as r", [r3, id, ip]))[0].r;
  const bonus3 = async (id: string) =>
    (await q<{ b: number }>("select bonus_spins b from visitors where restaurant_id=$1 and visitor_id=$2", [r3, id]))[0].b;
  const rewarded = async (id: string) =>
    (await q<{ x: boolean }>("select referral_rewarded x from visitors where restaurant_id=$1 and visitor_id=$2", [r3, id]))[0].x;

  await v("referrer-01", "gggggggg22", null, "ipA", "ipB"); // প্রথমে ipA, সর্বশেষ ipB
  await v("selfie-0001", "hhhhhhhh22", "referrer-01", "ipA"); // রেফারারের প্রথম IP-র সাথে মেলে
  await v("selfie-0002", "jjjjjjjj22", "referrer-01", "ipB"); // রেফারারের সর্বশেষ IP-র সাথে মেলে
  await v("selfie-0003", "kkkkkkkk22", "referrer-01", "ipC"); // নিজের রেকর্ডে আলাদা, কিন্তু এখনকার অনুরোধ ipA থেকে
  await v("friend-0001", "mmmmmmmm22", "referrer-01", "ipX");
  await v("friend-0002", "nnnnnnnn22", "referrer-01", "ipY");
  await v("friend-0003", "pppppppp22", "referrer-01", "ipZ");
  await v("friend-0004", "qqqqqqqq22", "referrer-01", "ipW");
  await v("noip-00001", "rrrrrrrr22", "referrer-01", null);

  assert.equal(await credit3("selfie-0001"), false, "রেফারারের প্রথম IP-তে মিলেছে");
  assert.equal(await credit3("selfie-0002"), false, "রেফারারের সর্বশেষ IP-তে মিলেছে");
  assert.equal(await credit3("selfie-0003", "ipA"), false, "এখনকার অনুরোধের IP মিলেছে");
  assert.equal(await bonus3("referrer-01"), 0, "ব্লক হলে কোনো বোনাস নেই");
  assert.equal(await rewarded("selfie-0001"), false);
  assert.equal(await credit3("selfie-0001"), false, "ব্লক হওয়া রেফারি আবার চেষ্টা করলেও না (একবারই প্রক্রিয়া)");

  assert.equal(await credit3("friend-0001"), true, "ভিন্ন IP-তে বন্ধু");
  assert.equal(await credit3("friend-0002"), true);
  assert.equal(await credit3("noip-00001"), true, "IP অজানা হলে ব্লক নয় (লোকাল/ডেভ)");
  assert.equal(await credit3("friend-0003"), false, "দৈনিক সীমা ৩ — ব্লক হওয়া তিনটি সীমা খরচ করেনি, বৈধ ৩টি করেছে");
  assert.equal(await bonus3("referrer-01"), 3);
  assert.equal(await rewarded("friend-0001"), true);
  assert.equal(await rewarded("friend-0003"), false);
  console.log("✓ credit_referral: একই IP (প্রথম/সর্বশেষ/বর্তমান) ব্লক, ব্লক সীমা খরচ করে না, IP অজানায় চলে, দৈনিক সীমা ৩");

  // ---- পেমেন্ট অনুরোধ ----
  const [owner4] = await q<{ id: string }>("insert into auth.users (email) values ('owner4@example.com') returning id");
  const [rest4] = await q<{ id: string }>(
    "insert into restaurants (owner_id, name, slug, plan) values ($1, 'Pay Test', 'pay-test', 'basic') returning id",
    [owner4.id],
  );
  const r4 = rest4.id;
  const submit = (ref: string, method = "bkash", plan = "standard", amount = 999, days = 30, note: string | null = null) =>
    q<{ id: string }>("select submit_payment_request($1,$2,$3,$4,$5,$6,$7) as id", [r4, plan, amount, method, ref, days, note]);
  const review = (id: string, approve: boolean, note: string | null = null) =>
    q<{ r: any }>("select review_payment_request($1,$2,$3,$4) as r", [id, user.id, approve, note]);
  const reqRow = async (id: string) =>
    (await q<any>("select status, payment_id, admin_note, reviewed_at, reference from payment_requests where id=$1", [id]))[0];

  const [{ id: reqA }] = await submit(" abc123xyz ", "bkash", "standard", 999, 30, " প্রথমবার ");
  assert.equal((await reqRow(reqA)).reference, "ABC123XYZ", "TrxID trim ও বড় হাতের");
  // অবৈধ ইনপুট (অপেক্ষমাণ < ৩ থাকতেই, যাতে কনস্ট্রেইন্টই আগে ধরা পড়ে)
  await expectError(submit("ABC123XYZ"), /duplicate key|unique/i, "একই TrxID দ্বিতীয়বার (pending)");
  await expectError(submit("XYZ", "cash"), /check|violates/i, "ক্যাশ অনুরোধে চলে না");
  await expectError(submit("AB"), /check|violates/i, "TrxID খুব ছোট");
  await expectError(submit("OKOKOK", "bkash", "gold"), /check|violates/i, "অবৈধ প্ল্যান");
  await expectError(
    q("select submit_payment_request($1,'basic',499,'bkash','NOREST1',30,null)", ["00000000-0000-0000-0000-000000000000"]),
    /not found/i,
    "অচেনা রেস্টুরেন্ট",
  );
  const [{ id: reqB }] = await submit("ABC123XYZ", "nagad"); // ভিন্ন মাধ্যম = বৈধ
  const [{ id: reqC }] = await submit("DEF456", "rocket");
  await expectError(submit("GHI789", "bkash"), /too many pending/i, "৩টির বেশি অপেক্ষমাণ");
  console.log("✓ submit_payment_request: TrxID স্বাভাবিকীকৃত, ডুপ্লিকেট/অপেক্ষমাণ-সীমা/অবৈধ ইনপুট ঠেকায়");

  // অনুমোদন: খাতায় এন্ট্রি + মেয়াদ বাড়া + প্ল্যান বদল (একসাথে)
  await q("update restaurants set service_until = now() + interval '5 days' where id=$1", [r4]);
  const approved = (await review(reqA, true, "TrxID মিলেছে"))[0].r;
  assert.equal(approved.status, "approved");
  const rowA = await reqRow(reqA);
  assert.equal(rowA.status, "approved");
  assert.equal(rowA.payment_id, approved.payment_id);
  assert.equal(rowA.admin_note, "TrxID মিলেছে");
  assert.ok(rowA.reviewed_at);
  const payRow = (await q<any>("select amount, method, reference, plan, period_days, recorded_by, note from payments where id=$1", [rowA.payment_id]))[0];
  assert.deepEqual(
    { a: payRow.amount, m: payRow.method, r: payRow.reference, p: payRow.plan, d: payRow.period_days, by: payRow.recorded_by, n: payRow.note },
    { a: 999, m: "bkash", r: "ABC123XYZ", p: "standard", d: 30, by: user.id, n: "প্রথমবার" },
  );
  d = await daysLeft(r4);
  assert.ok(d > 34.9 && d < 35.1, `৫ বাকি + ৩০ = ৩৫: ${d}`);
  assert.equal(await planOf(r4), "standard");
  await expectError(review(reqA, true), /already reviewed/i, "দ্বিতীয়বার অনুমোদন");
  await expectError(review(reqA, false), /already reviewed/i, "অনুমোদিতকে বাতিল");
  await expectError(review("00000000-0000-0000-0000-000000000000", true), /not found/i, "অচেনা অনুরোধ");
  console.log("✓ review (অনুমোদন): খাতায় এন্ট্রি, মেয়াদ ৫+৩০=৩৫ দিন, প্ল্যান বদল; দ্বিতীয়বার/অচেনা ব্লক");

  // বাতিল: কিছুই বদলায় না; TrxID আবার জমা দেওয়া যায়
  const before = daysLeft;
  const dBefore = await before(r4);
  const rej = (await review(reqB, false, "টাকা আসেনি"))[0].r;
  assert.equal(rej.status, "rejected");
  assert.equal((await reqRow(reqB)).status, "rejected");
  assert.equal((await reqRow(reqB)).payment_id, null);
  assert.ok(Math.abs((await daysLeft(r4)) - dBefore) < 0.01, "বাতিলে মেয়াদ অপরিবর্তিত");
  assert.equal(Number((await q<{ c: string }>("select count(*) c from payments where reference='ABC123XYZ' and method='nagad'"))[0].c), 0);
  const [{ id: reqB2 }] = await submit("ABC123XYZ", "nagad"); // বাতিলের পর একই TrxID আবার জমা
  assert.ok(reqB2 && reqB2 !== reqB);
  console.log("✓ review (বাতিল): মেয়াদ/খাতা অপরিবর্তিত; বাতিলের পর একই TrxID আবার জমা যায়");

  // অ্যাডমিন আগে হাতে রেকর্ড করে ফেলেছে → অনুমোদন 23505, অনুরোধ pending-ই থাকে
  await pay(r4, 500, "basic", "rocket", "DEF456", 30);
  const dMid = await daysLeft(r4);
  await expectError(review(reqC, true), /duplicate key|unique/i, "খাতায় আগেই থাকা TrxID");
  assert.equal((await reqRow(reqC)).status, "pending", "ব্যর্থ অনুমোদনে অনুরোধ pending-ই");
  assert.ok(Math.abs((await daysLeft(r4)) - dMid) < 0.01, "ব্যর্থ অনুমোদনে মেয়াদ বাড়েনি");
  await review(reqC, false, "ইতিমধ্যে রেকর্ডেড");
  // মালিক এমন TrxID জমা দিতে পারে না যা খাতায় আছে
  await expectError(submit("DEF456", "rocket"), /duplicate/i, "খাতায় থাকা TrxID জমা");
  console.log("✓ খাতায় আগেই থাকা TrxID: অনুমোদন ব্যর্থ ও অনুরোধ pending, নতুন জমাও ব্লক");

  // ---- রিমাইন্ডার ----
  const mkOwner = async (email: string | null, slug: string, daysFromNow: number, active = true) => {
    const [u] = await q<{ id: string | null }>(
      email ? "insert into auth.users (email) values ($1) returning id" : "select null::uuid as id",
      email ? [email] : [],
    );
    const [r] = await q<{ id: string }>(
      "insert into restaurants (owner_id, name, slug, is_active, service_until) values ($1, $2, $2, $3, now() + make_interval(secs => $4)) returning id",
      [u.id, slug, active, daysFromNow * 86400],
    );
    return r.id;
  };
  // বাকি পুরনো রেস্টুরেন্টগুলো আগে নিষ্ক্রিয় (শুধু এই অংশের গণনা আলাদা রাখতে)
  await q("update restaurants set is_active = false");
  const ids = {
    d7: await mkOwner("d7@example.com", "rem-d7", 5),
    d3: await mkOwner("d3@example.com", "rem-d3", 2),
    d1: await mkOwner("d1@example.com", "rem-d1", 0.5),
    exp: await mkOwner("exp@example.com", "rem-exp", -1),
    oldExp: await mkOwner("old@example.com", "rem-old", -4),
    far: await mkOwner("far@example.com", "rem-far", 20),
    susp: await mkOwner("susp@example.com", "rem-susp", 2, false),
    noOwner: await mkOwner(null, "rem-noowner", 2),
  };
  const due = async () =>
    (await q<{ restaurant_id: string; kind: string; owner_email: string; service_until: string }>("select * from due_reminders()")).sort(
      (a, b) => a.owner_email.localeCompare(b.owner_email),
    );

  let rows = await due();
  assert.deepEqual(
    rows.map((x) => `${x.owner_email}:${x.kind}`),
    ["d1@example.com:d1", "d3@example.com:d3", "d7@example.com:d7", "exp@example.com:expired"],
  );
  console.log("✓ due_reminders: d7/d3/d1/expired সঠিক; ৩ দিনের বেশি আগে শেষ, দূরের মেয়াদ, স্থগিত, মালিকহীন বাদ");

  const d3row = rows.find((x) => x.kind === "d3")!;
  const claim = async (rid: string, kind: string, until: string) =>
    (await q<{ r: boolean }>("select claim_reminder($1,$2,$3) as r", [rid, kind, until]))[0].r;
  assert.equal(await claim(d3row.restaurant_id, "d3", d3row.service_until), true);
  assert.equal(await claim(d3row.restaurant_id, "d3", d3row.service_until), false, "দ্বিতীয়বার দখল নয়");
  const par = await Promise.all(Array.from({ length: 5 }, () => claim(ids.d7, "d7", rows.find((x) => x.kind === "d7")!.service_until)));
  assert.equal(par.filter(Boolean).length, 1, "একসাথে ৫ cron-এ ঠিক ১টি দখল পায়");
  rows = await due();
  assert.deepEqual(rows.map((x) => x.kind).sort(), ["d1", "expired"], "দখল হওয়া বাদ");
  await q("select release_reminder($1,$2,$3)", [d3row.restaurant_id, "d3", d3row.service_until]);
  assert.ok((await due()).some((x) => x.kind === "d3"), "release করলে আবার due");

  // নবায়নে মেয়াদ বদলালে নতুন চক্র: একই ধরন আবার পাঠানো যায়
  const d7row = (await q<any>("select service_until from restaurants where id=$1", [ids.d7]))[0];
  assert.ok(!(await due()).some((x) => x.kind === "d7"), "d7 দখলে আছে");
  await q("update restaurants set service_until = now() + interval '6 days' where id=$1", [ids.d7]);
  assert.ok((await due()).some((x) => x.kind === "d7"), "মেয়াদ বদলালে নতুন চক্র");
  assert.notEqual(d7row.service_until, (await q<any>("select service_until from restaurants where id=$1", [ids.d7]))[0].service_until);
  await expectError(claim(ids.d1, "bogus", d3row.service_until), /check|violates/i, "অবৈধ ধরন");
  console.log("✓ claim/release_reminder: একবারই দখল, একসাথে ৫ cron-এ ১টি, release-এ ফেরে, নবায়নে নতুন চক্র");

  console.log("\nDB টেস্ট সব পাস ✅");
  await db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
