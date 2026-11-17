-- ============================================================
-- SpinReward — Supabase schema
-- Supabase → SQL Editor-এ পুরোটা paste করে Run করুন।
-- সব টেবিলে RLS চালু আছে এবং কোনো public policy নেই:
-- ডেটা শুধু সার্ভার (service role) API route দিয়ে পড়া/লেখা হয়।
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Tables ----------

create table if not exists public.restaurants (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references auth.users(id) on delete set null,
  name        text not null,
  slug        text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  plan        text not null default 'basic' check (plan in ('basic', 'standard', 'premium')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.rewards (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null references public.restaurants(id) on delete cascade,
  position         smallint not null check (position between 0 and 7),
  label            text not null check (char_length(label) between 1 and 20),
  discount_amount  integer not null default 0 check (discount_amount >= 0),
  weight           integer not null default 1 check (weight >= 0),
  color            text not null default '#f97316' check (color ~ '^#[0-9a-fA-F]{6}$'),
  unique (restaurant_id, position)
);

create table if not exists public.spins (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  reward_id      uuid not null references public.rewards(id) on delete restrict,
  visitor_id     text not null check (char_length(visitor_id) between 8 and 64),
  -- ঢাকার সময় অনুযায়ী দিন। unique constraint দিয়ে race-condition ছাড়াই "দিনে ১ স্পিন" নিশ্চিত হয়।
  spin_day       date not null default ((now() at time zone 'Asia/Dhaka')::date),
  created_at     timestamptz not null default now(),
  unique (restaurant_id, visitor_id, spin_day)
);

create table if not exists public.coupons (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null references public.restaurants(id) on delete cascade,
  reward_id        uuid not null references public.rewards(id) on delete restrict,
  spin_id          uuid not null references public.spins(id) on delete cascade,
  code             text not null unique,
  discount_amount  integer not null check (discount_amount > 0),
  status           text not null default 'active' check (status in ('active', 'redeemed')),
  expires_at       timestamptz not null,
  redeemed_at      timestamptz,
  created_at       timestamptz not null default now()
);

create index if not exists spins_restaurant_created_idx on public.spins (restaurant_id, created_at desc);
create index if not exists coupons_restaurant_status_idx on public.coupons (restaurant_id, status);
create index if not exists restaurants_owner_idx on public.restaurants (owner_id);

-- ---------- RLS (policy নেই = anon/authenticated কিছুই দেখতে পারে না) ----------

alter table public.restaurants enable row level security;
alter table public.rewards     enable row level security;
alter table public.spins       enable row level security;
alter table public.coupons     enable row level security;

-- ---------- নতুন রেস্টুরেন্টে ডিফল্ট ৮টি reward অটো তৈরি ----------

create or replace function public.seed_default_rewards()
returns trigger
language plpgsql
as $$
begin
  insert into public.rewards (restaurant_id, position, label, discount_amount, weight, color) values
    (new.id, 0, '৳50',       50,  15, '#f97316'),
    (new.id, 1, 'আবার চেষ্টা', 0,   20, '#475569'),
    (new.id, 2, '৳100',      100, 8,  '#16a34a'),
    (new.id, 3, '৳20',       20,  18, '#eab308'),
    (new.id, 4, '৳200',      200, 2,  '#dc2626'),
    (new.id, 5, 'আবার চেষ্টা', 0,   12, '#64748b'),
    (new.id, 6, '৳30',       30,  15, '#0ea5e9'),
    (new.id, 7, '৳10',       10,  10, '#a855f7');
  return new;
end;
$$;

drop trigger if exists restaurants_seed_rewards on public.restaurants;
create trigger restaurants_seed_rewards
  after insert on public.restaurants
  for each row execute function public.seed_default_rewards();

-- ---------- Dashboard stats (একটাই কুয়েরিতে সব) ----------

create or replace function public.restaurant_stats(p_restaurant uuid, p_days integer default 14)
returns jsonb
language sql
stable
as $$
  with days as (
    select d::date as day
    from generate_series(
      ((now() at time zone 'Asia/Dhaka')::date - (p_days - 1))::timestamp,
      (now() at time zone 'Asia/Dhaka')::date::timestamp,
      interval '1 day'
    ) as d
  ),
  spin_counts as (
    select (created_at at time zone 'Asia/Dhaka')::date as day, count(*) as c
    from public.spins where restaurant_id = p_restaurant group by 1
  ),
  redeem_counts as (
    select (redeemed_at at time zone 'Asia/Dhaka')::date as day, count(*) as c
    from public.coupons
    where restaurant_id = p_restaurant and redeemed_at is not null group by 1
  )
  select jsonb_build_object(
    'total_spins',       (select count(*) from public.spins   where restaurant_id = p_restaurant),
    'total_coupons',     (select count(*) from public.coupons where restaurant_id = p_restaurant),
    'total_redemptions', (select count(*) from public.coupons where restaurant_id = p_restaurant and status = 'redeemed'),
    'most_won', (
      select to_jsonb(t) from (
        select r.label, count(*)::int as wins
        from public.spins s join public.rewards r on r.id = s.reward_id
        where s.restaurant_id = p_restaurant and r.discount_amount > 0
        group by r.label order by wins desc, r.label limit 1
      ) t
    ),
    'daily', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'day', to_char(d.day, 'YYYY-MM-DD'),
          'spins', coalesce(sc.c, 0),
          'redemptions', coalesce(rc.c, 0)
        ) order by d.day
      ), '[]'::jsonb)
      from days d
      left join spin_counts sc on sc.day = d.day
      left join redeem_counts rc on rc.day = d.day
    )
  );
$$;

-- RPC শুধু service role চালাতে পারবে
revoke all on function public.restaurant_stats(uuid, integer) from public, anon, authenticated;
grant execute on function public.restaurant_stats(uuid, integer) to service_role;

-- ============================================================
-- ডেমো রেস্টুরেন্ট (পরীক্ষার জন্য)।
-- 1) Supabase → Authentication → Users → "Add user" দিয়ে একটা ইউজার বানান
-- 2) নিচের আপনার-ইউজার-uuid বদলে Run করুন:
--
-- insert into public.restaurants (owner_id, name, slug, plan)
-- values ('আপনার-ইউজার-uuid', 'Sampan Restaurant', 'sampan', 'standard');
-- ============================================================
