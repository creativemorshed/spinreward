/**
 * Admin API-র auth ও validation পথের টেস্ট — আসল Supabase ছাড়াই।
 * একটি ছোট mock Supabase সার্ভার (auth + REST) চালু করে, তার বিরুদ্ধে `next start` চালায়।
 * আগে `npm run build` করে নিতে হবে।   চালান: npm run test:api
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer, type IncomingMessage } from "node:http";

const MOCK_PORT = 54399;
const APP_PORT = 3199;
const BASE = `http://localhost:${APP_PORT}`;
const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const REST_ID = "33333333-3333-4333-8333-333333333333";

const rpcCalls: { name: string; body: any }[] = [];

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

const mock = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${MOCK_PORT}`);
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const token = (req.headers.authorization ?? "").replace("Bearer ", "");

  // Supabase Auth: GET /auth/v1/user
  if (url.pathname === "/auth/v1/user") {
    if (token === "admin-token") return send(200, { id: ADMIN_ID, email: "admin@example.com", aud: "authenticated" });
    if (token === "user-token") return send(200, { id: USER_ID, email: "user@example.com", aud: "authenticated" });
    return send(401, { code: 401, msg: "invalid JWT" });
  }

  // platform_admins
  if (url.pathname === "/rest/v1/platform_admins") {
    return send(200, url.searchParams.get("user_id") === `eq.${ADMIN_ID}` ? [{ user_id: ADMIN_ID }] : []);
  }

  // RPC
  if (url.pathname.startsWith("/rest/v1/rpc/")) {
    const name = url.pathname.split("/").pop() as string;
    const body = await readBody(req);
    rpcCalls.push({ name, body });
    if (name === "record_payment") {
      if (body.p_reference === "DUPLICATE") return send(409, { code: "23505", message: "duplicate key" });
      if (body.p_restaurant === "99999999-9999-4999-8999-999999999999") {
        return send(404, { code: "P0002", message: "restaurant not found" });
      }
      return send(200, { payment_id: "pay-1", service_until: "2027-01-01T00:00:00Z" });
    }
    if (name === "platform_stats") {
      return send(200, {
        paying_by_plan: { basic: 2, standard: 1, premium: 1 },
        revenue_total: 5000,
        daily: [],
        top_restaurants: [],
      });
    }
    if (name === "admin_restaurants") return send(200, []);
    return send(404, {});
  }

  // restaurants (slug-তে সংঘর্ষ পরীক্ষার জন্য "taken"; PATCH-এ দেখানো সারি)
  if (url.pathname === "/rest/v1/restaurants") {
    if (req.method === "GET") return send(200, url.searchParams.get("slug") === "eq.taken" ? [{ id: REST_ID }] : []);
    if (req.method === "PATCH") return send(200, [{ id: REST_ID, name: "X", slug: "x", plan: "premium", is_active: true }]);
  }

  send(404, { message: `unmocked ${req.method} ${url.pathname}` });
});

async function waitFor(url: string, ms = 30000) {
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

const call = (path: string, init: { method?: string; token?: string; body?: unknown } = {}) =>
  fetch(BASE + path, {
    method: init.method ?? "GET",
    headers: {
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  }).then(async (r) => ({ status: r.status, json: (await r.json().catch(() => ({}))) as any }));

async function main() {
  await new Promise<void>((r) => mock.listen(MOCK_PORT, r));

  const app = spawn("npx", ["next", "start", "-p", String(APP_PORT)], {
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: `http://localhost:${MOCK_PORT}`,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
      SUPABASE_SERVICE_ROLE_KEY: "service",
      NO_PROXY: "localhost,127.0.0.1",
    },
    stdio: "ignore",
  });

  try {
    await waitFor(`${BASE}/login`);

    // ---- auth ----
    const routes: [string, string][] = [
      ["GET", "/api/admin/stats"],
      ["GET", "/api/admin/restaurants"],
      ["POST", "/api/admin/restaurants"],
      ["GET", "/api/admin/payments"],
      ["POST", "/api/admin/payments"],
      ["PATCH", `/api/admin/restaurants/${REST_ID}`],
    ];
    for (const [method, path] of routes) {
      const body = method === "GET" ? undefined : {};
      assert.equal((await call(path, { method, body })).status, 401, `${method} ${path} টোকেন ছাড়া`);
      assert.equal((await call(path, { method, body, token: "garbage" })).status, 401, `${method} ${path} ভুল টোকেন`);
      assert.equal((await call(path, { method, body, token: "user-token" })).status, 403, `${method} ${path} সাধারণ ইউজার`);
    }
    console.log("✓ সব admin রুট: টোকেন নেই/ভুল → 401, সাধারণ ইউজার → 403");

    // ---- stats: MRR সার্ভারে গণনা ----
    const stats = await call("/api/admin/stats", { token: "admin-token" });
    assert.equal(stats.status, 200);
    assert.equal(stats.json.mrr, 2 * 499 + 999 + 1999);
    console.log("✓ /api/admin/stats: অ্যাডমিন → 200, MRR সঠিক");

    // ---- পেমেন্ট validation ----
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
    rpcCalls.length = 0;
    assert.equal((await pay({ method: "cash", reference: "" })).status, 201, "ক্যাশে TrxID লাগে না");
    assert.equal(rpcCalls.at(-1)?.body.p_reference, null, "ফাঁকা reference → null");
    console.log(`✓ পেমেন্ট validation: ${bad.length}টি অবৈধ ইনপুট 400; ক্যাশে TrxID ঐচ্ছিক`);

    rpcCalls.length = 0;
    const ok = await pay({ reference: " trx12345 " });
    assert.equal(ok.status, 201);
    assert.equal(ok.json.serviceUntil, "2027-01-01T00:00:00Z");
    const sent = rpcCalls.at(-1)!.body;
    assert.equal(sent.p_reference, "TRX12345", "TrxID বড় হাতের ও trim");
    assert.equal(sent.p_admin, ADMIN_ID, "রেকর্ডকারী = টোকেনের অ্যাডমিন (বডি থেকে নয়)");
    assert.equal(sent.p_amount, 999);
    console.log("✓ পেমেন্ট সফল: TrxID স্বাভাবিকীকৃত, recorded_by সার্ভার থেকে বসে");

    assert.equal((await pay({ reference: "DUPLICATE" })).status, 409);
    assert.equal((await pay({ restaurantId: "99999999-9999-4999-8999-999999999999" })).status, 404);
    console.log("✓ ডুপ্লিকেট TrxID → 409, অচেনা রেস্টুরেন্ট → 404");

    // ---- রেস্টুরেন্ট তৈরি validation ----
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
    for (const [label, patch] of badCreate) {
      const r = await mk(patch);
      assert.equal(r.status, 400, `${label} → ${r.status}`);
    }
    assert.equal((await mk({ slug: "taken" })).status, 409, "ব্যবহৃত slug → 409");
    console.log(`✓ রেস্টুরেন্ট তৈরি: ${badCreate.length}টি অবৈধ ইনপুট 400; ব্যবহৃত slug → 409`);

    // ---- PATCH validation ----
    const patchR = (id: string, body: unknown) =>
      call(`/api/admin/restaurants/${id}`, { method: "PATCH", token: "admin-token", body });
    assert.equal((await patchR("not-a-uuid", { plan: "basic" })).status, 400);
    assert.equal((await patchR(REST_ID, {})).status, 400, "পরিবর্তনের কিছু নেই");
    assert.equal((await patchR(REST_ID, { plan: "gold" })).status, 400);
    assert.equal((await patchR(REST_ID, { is_active: "no" })).status, 400);
    assert.equal((await patchR(REST_ID, { name: "x" })).status, 400);
    assert.equal((await patchR(REST_ID, { plan: "premium", is_active: false })).status, 200);
    console.log("✓ PATCH: অবৈধ id/ফাঁকা/অবৈধ মান → 400; বৈধ → 200");

    // ---- পেমেন্ট তালিকার ফিল্টার ----
    assert.equal((await call("/api/admin/payments?restaurant=bad", { token: "admin-token" })).status, 400);

    // ---- স্পিন-পেজ API-ও admin রুটের মতো আলাদা: সাধারণ রুট প্রভাবিত নয় ----
    assert.equal((await call("/api/spin", { method: "POST", body: { slug: "BAD", visitorId: "abcdefgh12" } })).status, 400);

    console.log("\nAdmin API টেস্ট সব পাস ✅");
  } finally {
    app.kill("SIGTERM");
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
