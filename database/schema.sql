-- ════════════════════════════════════════════════════════
--  SpinReward SaaS v2 — Complete Database Schema
--  Run this in Supabase SQL Editor
-- ════════════════════════════════════════════════════════

create extension if not exists "uuid-ossp";

-- ── Restaurants ──
create table restaurants (
  id                  uuid default uuid_generate_v4() primary key,
  owner_id            uuid references auth.users(id) on delete cascade,
  name                text not null,
  slug                text unique not null,
  email               text not null,
  phone               text,
  address             text,
  logo_url            text,
  subscription_status text default 'trial',   -- trial | active | expired
  subscription_plan   text default 'basic',    -- basic | standard | premium
  subscription_end    timestamptz,
  trial_end           timestamptz default (now() + interval '14 days'),
  is_active           boolean default true,
  created_at          timestamptz default now()
);

-- ── Wheel Configs ──
create table wheel_configs (
  id                  uuid default uuid_generate_v4() primary key,
  restaurant_id       uuid references restaurants(id) on delete cascade unique,
  brand_name          text,
  brand_tagline       text default 'আজকের বিশেষ অফার জিতুন!',
  primary_color       text default '#38bdf8',
  logo_type           text default 'emoji',
  logo_emoji          text default '🍽️',
  logo_image          text,
  spins_per_visit     int default 3,
  prize_cap           int default 100,
  prize_cap_enabled   boolean default true,
  admin_pass          text default 'admin123',
  segments            jsonb,   -- [{label, value, color, type, weight}]
  updated_at          timestamptz default now()
);

-- ── Spin Sessions ──
create table spin_sessions (
  id              uuid default uuid_generate_v4() primary key,
  restaurant_id   uuid references restaurants(id) on delete cascade,
  session_token   text unique not null,   -- unique per visit
  final_discount  int not null default 0,
  spins_count     int not null default 0,
  is_redeemed     boolean default false,
  redeemed_at     timestamptz,
  coupon_code     text unique,
  facebook_shared boolean default false,
  shared_at       timestamptz,
  created_at      timestamptz default now()
);

-- ── Payments ──
create table payments (
  id              uuid default uuid_generate_v4() primary key,
  restaurant_id   uuid references restaurants(id) on delete cascade,
  amount          int not null,
  plan            text not null,
  months          int default 1,
  payment_method  text,
  transaction_id  text,
  status          text default 'pending',  -- pending | success | failed
  notes           text,
  created_at      timestamptz default now()
);

-- ── RLS ──
alter table restaurants   enable row level security;
alter table wheel_configs enable row level security;
alter table spin_sessions enable row level security;
alter table payments      enable row level security;

-- Restaurants
create policy "owner_all" on restaurants for all
  using (auth.uid() = owner_id);

-- Wheel configs: owner write, public read
create policy "owner_write" on wheel_configs for all
  using (auth.uid() = (select owner_id from restaurants where id = restaurant_id));
create policy "public_read" on wheel_configs for select using (true);

-- Spin sessions: public insert + read own, owner read all
create policy "public_insert" on spin_sessions for insert with check (true);
create policy "public_read_own" on spin_sessions for select using (true);
create policy "owner_update" on spin_sessions for update
  using (auth.uid() = (select owner_id from restaurants where id = restaurant_id));

-- Payments: owner only
create policy "owner_payments" on payments for all
  using (auth.uid() = (select owner_id from restaurants where id = restaurant_id));

-- ── Indexes ──
create index on restaurants(slug);
create index on spin_sessions(restaurant_id, created_at desc);
create index on spin_sessions(coupon_code);
create index on spin_sessions(session_token);
create index on wheel_configs(restaurant_id);
