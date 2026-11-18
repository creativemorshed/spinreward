/**
 * API রুটগুলোর টেস্ট — আসল Supabase ছাড়াই।
 * একটি ছোট mock Supabase (auth + REST + RPC) ও mock Resend চালু করে, তার বিরুদ্ধে `next start` চালায়।
 * আগে `npm run build` করে নিতে হবে।   চালান: npm run test:api
 *
 * কভার করে: admin auth, পেমেন্ট/রেস্টুরেন্ট validation, মালিকের নবায়ন অনুরোধ, অ্যাডমিনের অনুমোদন/বাতিল,
 * cron রিমাইন্ডার (auth, ইমেইল পাঠানো, ব্যর্থ হলে release, dry-run, কনফিগ ছাড়া আচরণ),
 * IP burst limit (ও fail-open), স্পিন রুটের দৈনিক IP সীমা ও IP-হ্যাশ রেকর্ড।
 */
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type IncomingHttpHeaders, type IncomingMessage } from "node:http";
import { join } from "node:path";
import { hashIp } from "../src/lib/ip";

const MOCK_PORT = 54399;
const SALT = "test-salt";
const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const REST_ID = "33333333-3333-4333-8333-333333333333";
const REQ_OK = "44444444-4444-4444-8444-444444444444";
const REQ_DONE = "55555555-5555-4555-8555-555555555555";
const REQ_NF = "66666666-6666-4666-8666-666666666666";
const REQ_DUP = "77777777-7777-4777-8777-777777777777";

/* ---------------- mock সার্ভার ---------------- */

interface Call {
  method: string;
  path: string;
  query: URLSearchParams;
  body: any;
  headers: IncomingHttpHeaders;
}
const calls: Call[] = [];
const rpcCalls = (name: string) => calls.filter((c) => c.path === `/rest/v1/rpc/${name}`);
const callsTo = (method: string, path: string) => calls.filter((c) => c.method === method && c.path === path);

const S = {
  blockedBurstKey: null as string | null, // এই key-তে hit_rate_limit false দেয়
  errorBurstKey: null as string | null, // এই key-তে hit_rate_limit 500 দেয় (fail-open পরীক্ষা)
  ipSpinsToday: 0,
  visitorRow: null as null | { ref_code: string; bonus_spins: number; last_ip_hash: string | null },
  dueRows: [] as any[],
  claimedFalse: new Set<string>(), // "restaurantId:kind" — এগুলোতে claim_reminder false
  emails: [] as any[],
};
function resetState() {
  calls.length = 0;
  S.blockedBurstKey = null;
  S.errorBurstKey = null;
  S.ipSpinsToday = 0;
  S.visitorRow = null;
  S.dueRows = [];
  S.claimedFalse.clear();
  S.emails.length = 0;
}

function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

const OWNER_RESTAURANT = {
  id: REST_ID,
  name: "Sampan",
  slug: "sampan",
  plan: "standard",
  is_active: true,
  service_until: "2027-01-01T00:00:00Z",
};
const REQUEST_ROWS = [
  {
    id: REQ_OK,
    plan: "standard",
    amount: 999,
    method: "bkash",
    reference: "TRX1",
    period_days: 30,
    note: null,
    status: "pending",
    admin_note: null,
    created_at: "2026-11-18T00:00:00Z",
    reviewed_at: null,
    restaurants: { name: "Sampan", slug: "sampan" },
  },
];

const mock = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${MOCK_PORT}`);
  const method = req.method ?? "GET";
  const body = ["POST", "PATCH", "PUT"].includes(method) ? await readBody(req) : {};
  calls.push({ method, path: url.pathname, query: url.searchParams, body, headers: req.headers });

  const wantsObject = String(req.headers.accept ?? "").includes("pgrst.object");
  const send = (status: number, payload?: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(status, { "Content-Type": "application/json", ...headers });
    res.end(payload === undefined ? undefined : JSON.stringify(payload));
  };
  const token = (req.headers.authorization ?? "").replace("Bearer ", "");
  const p = url.pathname;
  const q = url.searchParams;

  // ---- Supabase Auth ----
  if (p === "/auth/v1/user") {
    if (token === "admin-token") return send(200, { id: ADMIN_ID, email: "admin@example.com", aud: "authenticated" });
    if (token === "user-token") return send(200, { id: USER_ID, email: "user@example.com", aud: "authenticated" });
    return send(401, { code: 401, msg: "invalid JWT" });
  }

  // ---- Resend ----
  if (p === "/emails" && method === "POST") {
    S.emails.push({ ...body, authorization: req.headers.authorization });
    if (String(body.to?.[0] ?? "").startsWith("fail@")) return send(500, { message: "boom" });
    return send(200, { id: "email-1" });
  }

  // ---- RPC ----
  if (p.startsWith("/rest/v1/rpc/")) {
    const name = p.split("/").pop() as string;
    switch (name) {
      case "record_payment":
        if (body.p_reference === "DUPLICATE") return send(409, { code: "23505", message: "duplicate key" });
        if (body.p_restaurant === "99999999-9999-4999-8999-999999999999") {
          return send(404, { code: "P0002", message: "restaurant not found" });
        }
        return send(200, { payment_id: "pay-1", service_until: "2027-01-01T00:00:00Z" });
      case "platform_stats":
        return send(200, {
          paying_by_plan: { basic: 2, standard: 1, premium: 1 },
          revenue_total: 5000,
          daily: [],
          top_restaurants: [],
        });
      case "admin_restaurants":
        return send(200, []);
      case "hit_rate_limit":
        if (S.errorBurstKey && body.p_key === S.errorBurstKey) return send(500, { message: "db down" });
        return send(200, !(S.blockedBurstKey && body.p_key === S.blockedBurstKey));
      case "purge_rate_limits":
        return send(200, 3);
      case "submit_payment_request":
        if (body.p_reference === "DUPEREF") return send(409, { code: "23505", message: "duplicate reference" });
        if (body.p_reference === "TOOMANY") return send(400, { code: "P0004", message: "too many pending requests" });
        return send(200, "new-request-id");
      case "review_payment_request":
        if (body.p_request === REQ_DONE) return send(400, { code: "P0003", message: "already reviewed" });
        if (body.p_request === REQ_NF) return send(404, { code: "P0002", message: "request not found" });
        if (body.p_request === REQ_DUP) return send(409, { code: "23505", message: "duplicate key" });
        return send(
          200,
          body.p_approve
            ? { payment_id: "pay-9", service_until: "2027-02-01T00:00:00Z", status: "approved" }
            : { status: "rejected" },
        );
      case "due_reminders":
        return send(200, S.dueRows);
      case "claim_reminder":
        return send(200, !S.claimedFalse.has(`${body.p_restaurant}:${body.p_kind}`));
      case "release_reminder":
        return send(204);
      case "credit_referral":
        return send(200, false);
      case "consume_bonus_spin":
        return send(200, false);
      default:
        return send(404, { message: `unmocked rpc ${name}` });
    }
  }

  // ---- টেবিল ----
  if (p === "/rest/v1/platform_admins") {
    return send(200, q.get("user_id") === `eq.${ADMIN_ID}` ? [{ user_id: ADMIN_ID }] : []);
  }

  if (p === "/rest/v1/restaurants") {
    if (method === "GET") {
      if (q.get("owner_id") === `eq.${USER_ID}`) return send(200, [OWNER_RESTAURANT]);
      if (q.get("slug") === "eq.taken" || q.get("slug") === "eq.sampan") return send(200, [{ id: REST_ID }]);
      return send(200, []);
    }
    if (method === "PATCH") return send(200, [{ id: REST_ID, name: "X", slug: "x", plan: "premium", is_active: true }]);
  }

  if (p === "/rest/v1/payment_requests" && method === "GET") return send(200, REQUEST_ROWS);
  if (p === "/rest/v1/payments" && method === "GET") return send(200, []);

  if (p === "/rest/v1/rewards" && method === "GET") {
    return send(
      200,
      Array.from({ length: 8 }, (_, i) => ({
        id: `rw${i}`,
        position: i,
        label: `R${i}`,
        discount_amount: 0, // কুপন বানাতে হয় না — রুট সরল থাকে
        weight: i === 1 ? 1 : 0, // সবসময় index 1
      })),
    );
  }

  if (p === "/rest/v1/visitors") {
    if (method === "GET") {
      if (q.has("ref_code")) return send(200, []); // রেফারার খোঁজা — নেই
      return send(200, S.visitorRow ? [S.visitorRow] : []);
    }
    if (method === "POST") {
      S.visitorRow = { ref_code: "abcdefgh22", bonus_spins: 0, last_ip_hash: body.last_ip_hash ?? null };
      const row = { ref_code: "abcdefgh22", bonus_spins: 0 };
      return send(201, wantsObject ? row : [row]);
    }
    if (method === "PATCH") return send(204);
  }

  if (p === "/rest/v1/spins") {
    if (method === "HEAD") {
      // দৈনিক IP গণনা (ip_hash ফিল্টার সহ) বনাম "আজ ফ্রি স্পিন বাকি?" (is_bonus ফিল্টার)
      const n = q.has("ip_hash") ? S.ipSpinsToday : 0;
      return send(200, undefined, { "content-range": `*/${n}` });
    }
    if (method === "POST") return send(201, wantsObject ? { id: "spin-1" } : [{ id: "spin-1" }]);
  }

  send(404, { message: `unmocked ${method} ${p}` });
});

/* ---------------- অ্যাপ প্রসেস ---------------- */

const BASE_ENV: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: `http://localhost:${MOCK_PORT}`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  IP_HASH_SALT: SALT,
  NO_PROXY: "localhost,127.0.0.1",
  no_proxy: "localhost,127.0.0.1",
};
const children: ChildProcess[] = [];

function startApp(port: number, extra: Record<string, string>) {
  const env: NodeJS.ProcessEnv = { ...process.env, ...BASE_ENV };
  for (const k of ["CRON_SECRET", "RESEND_API_KEY", "EMAIL_FROM", "RESEND_API_URL", "PAYMENT_BKASH_NUMBER", "PAYMENT_NAGAD_NUMBER"]) {
    delete env[k];
  }
  Object.assign(env, extra);
  const child = spawn(process.execPath, [join(process.cwd(), "node_modules/next/dist/bin/next"), "start", "-p", String(port)], {
    env,
    stdio: "ignore",
    detached: true,
  });
  children.push(child);
  return `http://localhost:${port}`;
}

async function waitFor(url: string, ms = 40000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  throw new Error(`${url} চালু হয়নি`);
}

type Init = { method?: string; token?: string; body?: unknown; headers?: Record<string, string> };
const make =
  (base: string) =>
  (path: string, init: Init = {}) =>
    fetch(base + path, {
      method: init.method ?? "GET",
      headers: {
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
        ...init.headers,
      },
      body: init.body === undefined ? undefined : typeof init.body === "string" ? init.body : JSON.stringify(init.body),
    }).then(async (r) => ({ status: r.status, headers: r.headers, json: (await r.json().catch(() => ({}))) as any }));

/* ---------------- টেস্ট ---------------- */

async function main() {
  await new Promise<void>((r) => mock.listen(MOCK_PORT, r));

  const A = startApp(3199, {
    CRON_SECRET: "cron-secret",
    RESEND_API_KEY: "rk_test",
    EMAIL_FROM: "SpinReward <noreply@example.com>",
    RESEND_API_URL: `http://localhost:${MOCK_PORT}/emails`,
    REMINDER_SEND_DELAY_MS: "0",
    PAYMENT_BKASH_NUMBER: "01700000000",
    NEXT_PUBLIC_SITE_URL: "https://app.example.com",
  });
  const B = startApp(3198, { CRON_SECRET: "cron-secret" }); // ইমেইল কনফিগ নেই
  const C = startApp(3197, {}); // CRON_SECRET নেই
  const call = make(A);

  try {
    await Promise.all([waitFor(`${A}/login`), waitFor(`${B}/login`), waitFor(`${C}/login`)]);

    /* ===== অ্যাডমিন auth ===== */
    const adminRoutes: [string, string][] = [
      ["GET", "/api/admin/stats"],
      ["GET", "/api/admin/restaurants"],
      ["POST", "/api/admin/restaurants"],
      ["GET", "/api/admin/payments"],
      ["POST", "/api/admin/payments"],
      ["PATCH", `/api/admin/restaurants/${REST_ID}`],
      ["GET", "/api/admin/payment-requests"],
      ["POST", `/api/admin/payment-requests/${REQ_OK}`],
    ];
    for (const [method, path] of adminRoutes) {
      const body = method === "GET" ? undefined : {};
      assert.equal((await call(path, { method, body })).status, 401, `${method} ${path} টোকেন ছাড়া`);
      assert.equal((await call(path, { method, body, token: "garbage" })).status, 401, `${method} ${path} ভুল টোকেন`);
      assert.equal((await call(path, { method, body, token: "user-token" })).status, 403, `${method} ${path} সাধারণ ইউজার`);
    }
    console.log(`✓ ${adminRoutes.length}টি admin রুট: টোকেন নেই/ভুল → 401, সাধারণ ইউজার → 403`);

    /* ===== stats ===== */
    const stats = await call("/api/admin/stats", { token: "admin-token" });
    assert.equal(stats.status, 200);
    assert.equal(stats.json.mrr, 2 * 499 + 999 + 1999);
    console.log("✓ /api/admin/stats: অ্যাডমিন → 200, MRR সঠিক");

    /* ===== অ্যাডমিনের পেমেন্ট validation ===== */
    const good = { restaurantId: REST_ID, amount: 999, plan: "standard", method: "bkash", reference: "trx12345", periodDays: 30 };
    const pay = (patch: Record<string, unknown>) =>
      call("/api/admin/payments", { method: "POST", token: "admin-token", body: { ...good, ...patch } });
    const bad: [string, Record<string, unknown>][] = [
      ["restaurantId অবৈধ", { restaurantId: "abc" }],
      ["amount ০", { amount: 0 }],
      ["amount দশমিক", { amount: 99.5 }],
      ["amount স্ট্রিং", { amount: "999" }],
      ["amount অতিরিক্ত", { amount: 2_000_000 }],
      ["অবৈধ প্ল্যান", { plan: "gold" }],
      ["অবৈধ মাধ্যম", { method: "paypal" }],
      ["bKash-এ TrxID নেই", { reference: "" }],
      ["bKash-এ TrxID ফাঁকা স্পেস", { reference: "   " }],
      ["TrxID খুব ছোট", { reference: "ab" }],
      ["periodDays ০", { periodDays: 0 }],
      ["periodDays ৪০০", { periodDays: 400 }],
      ["note অতি দীর্ঘ", { note: "x".repeat(301) }],
    ];
    for (const [label, patch] of bad) {
      const r = await pay(patch);
      assert.equal(r.status, 400, `${label} → ${r.status} ${JSON.stringify(r.json)}`);
    }
    assert.equal((await pay({ method: "cash", reference: "" })).status, 201, "ক্যাশে TrxID লাগে না");
    assert.equal(rpcCalls("record_payment").at(-1)?.body.p_reference, null, "ফাঁকা reference → null");
    calls.length = 0;
    const ok = await pay({ reference: " trx12345 " });
    assert.equal(ok.status, 201);
    assert.equal(ok.json.serviceUntil, "2027-01-01T00:00:00Z");
    const sent = rpcCalls("record_payment").at(-1)!.body;
    assert.equal(sent.p_reference, "TRX12345", "TrxID বড় হাতের ও trim");
    assert.equal(sent.p_admin, ADMIN_ID, "রেকর্ডকারী = টোকেনের অ্যাডমিন (বডি থেকে নয়)");
    assert.equal((await pay({ reference: "DUPLICATE" })).status, 409);
    assert.equal((await pay({ restaurantId: "99999999-9999-4999-8999-999999999999" })).status, 404);
    console.log(`✓ অ্যাডমিনের পেমেন্ট: ${bad.length}টি অবৈধ ইনপুট 400; সফল 201 (TrxID স্বাভাবিকীকৃত); ডুপ্লিকেট 409; অচেনা 404`);

    /* ===== রেস্টুরেন্ট তৈরি / PATCH validation ===== */
    const mk = (patch: Record<string, unknown>) =>
      call("/api/admin/restaurants", {
        method: "POST",
        token: "admin-token",
        body: { name: "Sampan", slug: "sampan", plan: "basic", ownerEmail: "o@example.com", ...patch },
      });
    const badCreate: [string, Record<string, unknown>][] = [
      ["নাম খুব ছোট", { name: "A" }],
      ["slug বড় হাতের/স্পেস", { slug: "Bad Slug" }],
      ["slug ছোট", { slug: "ab" }],
      ["অবৈধ প্ল্যান", { plan: "gold" }],
      ["অবৈধ ইমেইল", { ownerEmail: "nope" }],
    ];
    for (const [label, patch] of badCreate) assert.equal((await mk(patch)).status, 400, label);
    assert.equal((await mk({ slug: "taken" })).status, 409, "ব্যবহৃত slug → 409");
    const patchR = (id: string, body: unknown) =>
      call(`/api/admin/restaurants/${id}`, { method: "PATCH", token: "admin-token", body });
    assert.equal((await patchR("not-a-uuid", { plan: "basic" })).status, 400);
    assert.equal((await patchR(REST_ID, {})).status, 400);
    assert.equal((await patchR(REST_ID, { plan: "gold" })).status, 400);
    assert.equal((await patchR(REST_ID, { is_active: "no" })).status, 400);
    assert.equal((await patchR(REST_ID, { name: "x" })).status, 400);
    assert.equal((await patchR(REST_ID, { plan: "premium", is_active: false })).status, 200);
    assert.equal((await call("/api/admin/payments?restaurant=bad", { token: "admin-token" })).status, 400);
    console.log("✓ রেস্টুরেন্ট তৈরি/PATCH: অবৈধ ইনপুট 400, ব্যবহৃত slug 409, বৈধ PATCH 200");

    /* ===== মালিকের নবায়ন অনুরোধ ===== */
    for (const [method, body] of [["GET", undefined], ["POST", {}]] as const) {
      assert.equal((await call("/api/payment-requests", { method, body })).status, 401, `${method} টোকেন ছাড়া`);
      assert.equal((await call("/api/payment-requests", { method, body, token: "garbage" })).status, 401);
      assert.equal(
        (await call("/api/payment-requests", { method, body, token: "admin-token" })).status,
        401,
        `${method}: যে ইউজারের রেস্টুরেন্ট নেই`,
      );
    }
    calls.length = 0;
    const list = await call("/api/payment-requests", { token: "user-token" });
    assert.equal(list.status, 200);
    assert.equal(list.json.instructions.bkash, "01700000000", "পেমেন্ট নম্বর env থেকে");
    assert.equal(list.json.instructions.nagad, undefined, "সেট না থাকা মাধ্যম বাদ");
    assert.equal(list.json.requests.length, 1);
    assert.equal(
      callsTo("GET", "/rest/v1/payment_requests").at(-1)!.query.get("restaurant_id"),
      `eq.${REST_ID}`,
      "শুধু নিজের রেস্টুরেন্টের অনুরোধ আনা হয়",
    );
    console.log("✓ GET /api/payment-requests: 401 নিয়ম, নিজের অনুরোধ, env থেকে পেমেন্ট নম্বর");

    const reqPost = (patch: Record<string, unknown>) =>
      call("/api/payment-requests", {
        method: "POST",
        token: "user-token",
        body: { plan: "standard", months: 3, method: "bkash", reference: "trx 99aa", ...patch },
      });
    const badReq: [string, Record<string, unknown>][] = [
      ["অবৈধ প্ল্যান", { plan: "gold" }],
      ["মাস ৪", { months: 4 }],
      ["মাস স্ট্রিং", { months: "3" }],
      ["ক্যাশ (মালিক পারে না)", { method: "cash" }],
      ["অবৈধ মাধ্যম", { method: "paypal" }],
      ["TrxID ছোট", { reference: "ab" }],
      ["TrxID ফাঁকা", { reference: "   " }],
      ["TrxID-তে অবৈধ চিহ্ন", { reference: "AB$%12" }],
      ["TrxID অতি দীর্ঘ", { reference: "A".repeat(65) }],
      ["নোট অতি দীর্ঘ", { note: "x".repeat(201) }],
    ];
    for (const [label, patch] of badReq) {
      const r = await reqPost(patch);
      assert.equal(r.status, 400, `${label} → ${r.status} ${JSON.stringify(r.json)}`);
    }
    assert.equal((await call("/api/payment-requests", { method: "POST", token: "user-token", body: "{" })).status, 400, "ভাঙা JSON");
    assert.equal(rpcCalls("submit_payment_request").length, 0, "অবৈধ অনুরোধে ডাটাবেস ডাকা হয়নি");

    calls.length = 0;
    const created = await reqPost({ amount: 1, periodDays: 1, restaurantId: "other-restaurant", note: "  ধন্যবাদ " });
    assert.equal(created.status, 201);
    assert.deepEqual({ a: created.json.amount, d: created.json.periodDays }, { a: 2997, d: 90 });
    const sub = rpcCalls("submit_payment_request").at(-1)!.body;
    assert.equal(sub.p_amount, 2997, "পরিমাণ সার্ভারে গণনা (ক্লায়েন্টের amount:1 উপেক্ষা)");
    assert.equal(sub.p_period_days, 90);
    assert.equal(sub.p_restaurant, REST_ID, "রেস্টুরেন্ট টোকেন থেকে (বডির restaurantId উপেক্ষা)");
    assert.equal(sub.p_reference, "TRX99AA", "স্পেস বাদ ও বড় হাতের");
    assert.equal(sub.p_note, "ধন্যবাদ");
    assert.equal((await reqPost({ reference: "DUPEREF" })).status, 409);
    assert.equal((await reqPost({ reference: "TOOMANY" })).status, 429);
    console.log(`✓ POST /api/payment-requests: ${badReq.length}+১টি অবৈধ ইনপুট 400; পরিমাণ/মেয়াদ/রেস্টুরেন্ট সার্ভারে নির্ধারিত; ডুপ্লিকেট 409; অপেক্ষমাণ-সীমা 429`);

    /* ===== অ্যাডমিনের অনুরোধ তালিকা ও সিদ্ধান্ত ===== */
    assert.equal((await call("/api/admin/payment-requests?status=weird", { token: "admin-token" })).status, 400);
    calls.length = 0;
    const pend = await call("/api/admin/payment-requests", { token: "admin-token" });
    assert.equal(pend.status, 200);
    assert.equal(pend.json.requests.length, 1);
    assert.equal(callsTo("GET", "/rest/v1/payment_requests").at(-1)!.query.get("status"), "eq.pending", "ডিফল্ট pending");
    calls.length = 0;
    await call("/api/admin/payment-requests?status=all", { token: "admin-token" });
    assert.equal(callsTo("GET", "/rest/v1/payment_requests").at(-1)!.query.has("status"), false, "all-এ ফিল্টার নেই");

    const decide = (id: string, body: unknown) =>
      call(`/api/admin/payment-requests/${id}`, { method: "POST", token: "admin-token", body });
    assert.equal((await decide("not-a-uuid", { action: "approve" })).status, 400);
    assert.equal((await decide(REQ_OK, {})).status, 400);
    assert.equal((await decide(REQ_OK, { action: "delete" })).status, 400);
    assert.equal((await decide(REQ_OK, { action: "reject" })).status, 400, "কারণ ছাড়া বাতিল নয়");
    assert.equal((await decide(REQ_OK, { action: "reject", note: "  " })).status, 400);
    assert.equal((await decide(REQ_OK, { action: "approve", note: "x".repeat(301) })).status, 400);
    assert.equal((await call(`/api/admin/payment-requests/${REQ_OK}`, { method: "POST", token: "admin-token", body: "{" })).status, 400);
    assert.equal(rpcCalls("review_payment_request").length, 0, "অবৈধ সিদ্ধান্তে ডাটাবেস ডাকা হয়নি");

    const approve = await decide(REQ_OK, { action: "approve", note: "TrxID মিলেছে" });
    assert.equal(approve.status, 200);
    assert.equal(approve.json.status, "approved");
    assert.equal(approve.json.service_until, "2027-02-01T00:00:00Z");
    let rv = rpcCalls("review_payment_request").at(-1)!.body;
    assert.deepEqual(
      { id: rv.p_request, admin: rv.p_admin, approve: rv.p_approve, note: rv.p_admin_note },
      { id: REQ_OK, admin: ADMIN_ID, approve: true, note: "TrxID মিলেছে" },
      "অনুমোদনকারী = টোকেনের অ্যাডমিন",
    );
    const reject = await decide(REQ_OK, { action: "reject", note: "টাকা আসেনি" });
    assert.equal(reject.status, 200);
    rv = rpcCalls("review_payment_request").at(-1)!.body;
    assert.deepEqual({ approve: rv.p_approve, note: rv.p_admin_note }, { approve: false, note: "টাকা আসেনি" });
    assert.equal((await decide(REQ_DONE, { action: "approve" })).status, 409, "আগেই যাচাই হয়েছে");
    assert.equal((await decide(REQ_NF, { action: "approve" })).status, 404);
    const dup = await decide(REQ_DUP, { action: "approve" });
    assert.equal(dup.status, 409);
    assert.match(dup.json.error, /বাতিল/, "ডুপ্লিকেটে করণীয় বলা হয়");
    console.log("✓ অ্যাডমিনের অনুরোধ: তালিকা (pending/all), ৭টি অবৈধ ইনপুট 400, অনুমোদন/বাতিল, ৪০৯/৪০৪ ম্যাপিং");

    /* ===== cron রিমাইন্ডার ===== */
    const cronA = make(A);
    assert.equal((await cronA("/api/cron/reminders")).status, 401, "টোকেন ছাড়া");
    assert.equal((await cronA("/api/cron/reminders", { token: "wrong" })).status, 401);
    assert.equal((await cronA("/api/cron/reminders", { token: "cron-secret-extra" })).status, 401, "দৈর্ঘ্য ভিন্ন");
    assert.equal((await cronA("/api/cron/reminders", { token: "user-token" })).status, 401, "সাধারণ ইউজারের টোকেন নয়");
    assert.equal((await make(C)("/api/cron/reminders", { token: "cron-secret" })).status, 503, "CRON_SECRET না থাকলে বন্ধ (fail-closed)");
    assert.equal((await make(C)("/api/cron/reminders")).status, 503);
    console.log("✓ cron auth: ভুল/ছাড়া টোকেন 401; CRON_SECRET সেট না থাকলে 503 (কখনও খোলা থাকে না)");

    const due = (id: string, name: string, email: string, kind: string) => ({
      restaurant_id: id,
      name,
      slug: name.toLowerCase(),
      owner_email: email,
      service_until: "2026-11-20T10:00:00Z",
      kind,
    });
    S.dueRows = [
      due("rA", "Alpha", "alpha@example.com", "d3"),
      due("rB", "Beta", "fail@example.com", "d1"),
      due("rC", "Gamma", "gamma@example.com", "d7"),
      due("rD", "Delta", "delta@example.com", "bogus"), // অচেনা ধরন — বাদ
    ];
    S.claimedFalse.add("rC:d7"); // অন্য রান আগেই দখল করেছে

    calls.length = 0;
    const dry = await cronA("/api/cron/reminders?dry=1", { token: "cron-secret" });
    assert.equal(dry.status, 200);
    assert.equal(dry.json.dry, true);
    assert.equal(dry.json.due.length, 3, "অচেনা ধরন বাদ");
    assert.equal(S.emails.length, 0, "dry-run-এ কিছু পাঠানো হয়নি");
    assert.equal(rpcCalls("claim_reminder").length, 0, "dry-run-এ দখলও নয়");

    calls.length = 0;
    const run = await cronA("/api/cron/reminders", { token: "cron-secret" });
    assert.equal(run.status, 200);
    assert.deepEqual(
      { due: run.json.due, sent: run.json.sent, failed: run.json.failed, skippedClaimed: run.json.skippedClaimed, deferred: run.json.deferred },
      { due: 3, sent: 1, failed: 1, skippedClaimed: 1, deferred: 0 },
    );
    assert.equal(run.json.purgedRateLimits, 3);
    assert.equal(rpcCalls("purge_rate_limits").length, 1);
    const tos = S.emails.map((e) => e.to[0]);
    assert.deepEqual(tos, ["alpha@example.com", "fail@example.com"], "দখল-না-পাওয়া gamma-কে পাঠানো হয়নি");
    const first = S.emails[0];
    assert.equal(first.authorization, "Bearer rk_test");
    assert.equal(first.from, "SpinReward <noreply@example.com>");
    assert.ok(first.subject.includes("Alpha"));
    assert.ok(first.html.includes("https://app.example.com/dashboard"), "NEXT_PUBLIC_SITE_URL থেকে লিংক");
    assert.ok(first.text.length > 20);
    const rel = rpcCalls("release_reminder");
    assert.equal(rel.length, 1, "ব্যর্থ ইমেইলের দখল ছাড়া হয়েছে (পরের রানে আবার চেষ্টা)");
    assert.deepEqual({ r: rel[0].body.p_restaurant, k: rel[0].body.p_kind }, { r: "rB", k: "d1" });
    assert.equal(rpcCalls("claim_reminder").length, 3);
    console.log("✓ cron রিমাইন্ডার: dry-run কিছু পাঠায় না; ১ পাঠানো, ১ ব্যর্থ (দখল ছাড়া), ১ আগেই দখল; অচেনা ধরন বাদ");

    // ইমেইল কনফিগ নেই (instance B): কিছু পাঠায় না, দখলও করে না
    S.dueRows = [due("rA", "Alpha", "alpha@example.com", "d3")];
    calls.length = 0;
    S.emails.length = 0;
    const noMail = await make(B)("/api/cron/reminders", { token: "cron-secret" });
    assert.equal(noMail.status, 200);
    assert.match(noMail.json.skipped, /ইমেইল কনফিগার/);
    assert.equal(noMail.json.due, 1);
    assert.equal(S.emails.length, 0);
    assert.equal(rpcCalls("claim_reminder").length, 0, "কনফিগ ছাড়া দখল করলে ইমেইল চিরতরে হারাত");
    console.log("✓ ইমেইল কনফিগ ছাড়া: কিছু পাঠায় না, দখলও করে না (কনফিগ দিলে পরের রানে যাবে)");

    /* ===== IP burst limit ===== */
    const blockedIp = "203.0.113.9";
    const blockedKey = `burst:${hashIp(blockedIp, SALT)}`;
    const visitorBody = { slug: "sampan", visitorId: "visitor-test-1" };
    const asIp = (ip: string) => ({ "x-forwarded-for": ip });

    resetState();
    S.blockedBurstKey = blockedKey;
    for (const [path, body] of [
      ["/api/visitor", visitorBody],
      ["/api/share", visitorBody],
      ["/api/spin", visitorBody],
    ] as const) {
      const r = await call(path, { method: "POST", body, headers: asIp(blockedIp) });
      assert.equal(r.status, 429, `${path} সীমা পেরোলে`);
      assert.equal(r.json.code, "RATE_LIMITED");
      assert.equal(r.headers.get("retry-after"), "60");
    }
    assert.equal(callsTo("GET", "/rest/v1/restaurants").length, 0, "সীমা পেরোলে ডাটাবেসে ঢোকেই না");
    const ownerBlocked = await call("/api/payment-requests", {
      method: "POST",
      token: "user-token",
      body: { plan: "basic", method: "bkash", reference: "TRX555" },
      headers: asIp(blockedIp),
    });
    assert.equal(ownerBlocked.status, 429, "মালিকের অনুরোধ জমাতেও burst সীমা");
    assert.equal(rpcCalls("submit_payment_request").length, 0);

    const okIp = await call("/api/visitor", { method: "POST", body: visitorBody, headers: asIp("203.0.113.77") });
    assert.equal(okIp.status, 200, "অন্য IP আটকায় না");
    assert.equal(okIp.json.refCode, "abcdefgh22");
    const burstKeys = rpcCalls("hit_rate_limit").map((c) => c.body.p_key);
    assert.ok(burstKeys.every((k) => /^burst:[0-9a-f]{32}$/.test(k)), "key-তে শুধু হ্যাশ, আসল IP নয়");
    assert.ok(!JSON.stringify(calls).includes("203.0.113.9"), "আসল IP কখনও ডাটাবেসে যায় না");
    assert.equal(rpcCalls("hit_rate_limit").at(-1)!.body.p_window_seconds, 60);
    assert.equal(rpcCalls("hit_rate_limit").at(-1)!.body.p_max, 60);

    resetState();
    const failIp = "203.0.113.10";
    S.errorBurstKey = `burst:${hashIp(failIp, SALT)}`;
    assert.equal((await call("/api/visitor", { method: "POST", body: visitorBody, headers: asIp(failIp) })).status, 200, "ডাটাবেস ত্রুটিতে fail-open");
    // হেডার ছাড়া অনুরোধেও Next.js নিজে সংযোগের ঠিকানা x-forwarded-for-এ বসায় — তাই প্রক্সি ছাড়া চললেও IP ধরা পড়ে
    resetState();
    assert.equal((await call("/api/visitor", { method: "POST", body: visitorBody })).status, 200);
    assert.equal(rpcCalls("hit_rate_limit").length, 1, "হেডার না পাঠালেও সংযোগের IP-তে সীমা প্রযোজ্য");
    assert.match(rpcCalls("hit_rate_limit")[0].body.p_key, /^burst:[0-9a-f]{32}$/);
    console.log("✓ burst limit: visitor/share/spin/নবায়ন ৪টিতেই 429+Retry-After; অন্য IP চলে; DB ত্রুটিতে fail-open; ডাটাবেসে শুধু হ্যাশ");

    /* ===== স্পিন রুট: দৈনিক IP সীমা, IP-হ্যাশ রেকর্ড ===== */
    const ip = "198.51.100.23";
    const ipHash = hashIp(ip, SALT);

    resetState();
    S.ipSpinsToday = 100; // ডিফল্ট সীমা ঠিক পূর্ণ
    const capped = await call("/api/spin", { method: "POST", body: visitorBody, headers: asIp(ip) });
    assert.equal(capped.status, 429);
    assert.equal(capped.json.code, "IP_LIMIT");
    assert.equal(callsTo("POST", "/rest/v1/spins").length, 0, "সীমা পূর্ণ হলে স্পিনই রেকর্ড হয়নি");
    assert.equal(callsTo("POST", "/rest/v1/visitors").length, 0);
    const countQuery = callsTo("HEAD", "/rest/v1/spins").at(-1)!.query;
    assert.equal(countQuery.get("ip_hash"), `eq.${ipHash}`);
    assert.equal(countQuery.get("restaurant_id"), `eq.${REST_ID}`);
    assert.match(countQuery.get("spin_day") ?? "", /^eq\.\d{4}-\d{2}-\d{2}$/, "ঢাকার আজকের দিন");

    resetState();
    S.ipSpinsToday = 99; // সীমার ঠিক নিচে
    const allowed = await call("/api/spin", { method: "POST", body: visitorBody, headers: asIp(ip) });
    assert.equal(allowed.status, 200, JSON.stringify(allowed.json));
    assert.equal(allowed.json.rewardIndex, 1);
    assert.equal(allowed.json.refCode, "abcdefgh22");
    const spinBody = callsTo("POST", "/rest/v1/spins").at(-1)!.body;
    assert.deepEqual(
      { r: spinBody.restaurant_id, v: spinBody.visitor_id, b: spinBody.is_bonus, ip: spinBody.ip_hash },
      { r: REST_ID, v: "visitor-test-1", b: false, ip: ipHash },
      "স্পিনে IP-হ্যাশ রেকর্ড",
    );
    const visBody = callsTo("POST", "/rest/v1/visitors").at(-1)!.body;
    assert.equal(visBody.ip_hash, ipHash);
    assert.equal(visBody.last_ip_hash, ipHash);
    assert.equal(rpcCalls("credit_referral").at(-1)!.body.p_ip, ipHash, "রেফারেল ক্রেডিটে বর্তমান IP পাঠানো হয়");
    assert.ok(!JSON.stringify(calls).includes(ip), "আসল IP কোথাও যায়নি");

    // হেডার ছাড়া: Next.js সংযোগের ঠিকানা বসায়, তাই তখনও একটি (লোকালহোস্টের) হ্যাশ রেকর্ড হয়
    resetState();
    const noHeader = await call("/api/spin", { method: "POST", body: visitorBody });
    assert.equal(noHeader.status, 200);
    assert.match(callsTo("POST", "/rest/v1/spins").at(-1)!.body.ip_hash, /^[0-9a-f]{32}$/);

    // বিদ্যমান ভিজিটর অন্য IP থেকে এলে সর্বশেষ IP হালনাগাদ হয়
    resetState();
    S.visitorRow = { ref_code: "abcdefgh22", bonus_spins: 0, last_ip_hash: "oldhash" };
    assert.equal((await call("/api/visitor", { method: "POST", body: visitorBody, headers: asIp(ip) })).status, 200);
    const upd = callsTo("PATCH", "/rest/v1/visitors");
    assert.ok(upd.some((c) => c.body.last_ip_hash === ipHash), "last_ip_hash হালনাগাদ");
    assert.ok(
      upd.some((c) => c.body.ip_hash === ipHash && c.query.get("ip_hash") === "is.null"),
      "ip_hash শুধু ফাঁকা থাকলে বসে (প্রথম-দেখা IP বদলায় না)",
    );
    resetState();
    S.visitorRow = { ref_code: "abcdefgh22", bonus_spins: 0, last_ip_hash: ipHash };
    await call("/api/visitor", { method: "POST", body: visitorBody, headers: asIp(ip) });
    assert.equal(callsTo("PATCH", "/rest/v1/visitors").length, 0, "IP না বদলালে অকারণ লেখা নেই");
    console.log("✓ স্পিন রুট: IP সীমা (১০০ = ব্লক, ৯৯ = চলে), IP-হ্যাশ স্পিন/ভিজিটরে রেকর্ড, রেফারেলে IP পাস, last_ip হালনাগাদ");

    console.log("\nAPI টেস্ট সব পাস ✅");
  } finally {
    for (const c of children) {
      try {
        if (c.pid) process.kill(-c.pid, "SIGTERM");
      } catch {
        /* আগেই বন্ধ */
      }
    }
    mock.close();
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
