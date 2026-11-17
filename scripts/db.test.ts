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
    create table auth.users (id uuid primary key default gen_random_uuid());
    create role anon; create role authenticated; create role service_role;
  `);

  // দুইবার চালিয়ে idempotency যাচাই
  await db.exec(read("schema.sql"));
  await db.exec(read("002_viral_loop.sql"));
  await db.exec(read("002_viral_loop.sql"));
  console.log("✓ schema.sql + 002_viral_loop.sql চলেছে (মাইগ্রেশন idempotent)");

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

  console.log("\nDB টেস্ট সব পাস ✅");
  await db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
