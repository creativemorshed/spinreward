-- ============================================================
-- SpinReward — Migration 002: Viral Loop
-- schema.sql চালানোর পরে Supabase SQL Editor-এ এটি Run করুন (নিরাপদে বারবার চালানো যায়)।
--
-- লুপ: স্পিন → জেতা → শেয়ার (+১ বোনাস স্পিন, দিনে ১ বার)
--      → বন্ধু লিংকে ঢুকে প্রথম স্পিন করলে রেফারার +১ বোনাস স্পিন (দিনে সর্বোচ্চ ৩ জন)
-- বোনাস স্পিন জমানোর সর্বোচ্চ সীমা ৫।
-- ============================================================

-- ---------- visitors: প্রতিটি কাস্টমার-ডিভাইসের বোনাস ব্যালেন্স ও রেফারেল তথ্য ----------

create table if not exists public.visitors (
  restaurant_id         uuid not null references public.restaurants(id) on delete cascade,
  visitor_id            text not null check (char_length(visitor_id) between 8 and 64),
  -- শেয়ার-লিংকে বসে (visitor_id গোপন থাকে — ওটা জানলে অন্যের স্পিন খরচ করা যেত)
  ref_code              text not null unique check (ref_code ~ '^[a-hjkmnp-z2-9]{10}$'),
  bonus_spins           integer not null default 0 check (bonus_spins between 0 and 5),
  referred_by_visitor   text,
  referral_credited_at  timestamptz,
  last_share_day        date,
  created_at            timestamptz not null default now(),
  primary key (restaurant_id, visitor_id)
);

create index if not exists visitors_referrer_idx
  on public.visitors (restaurant_id, referred_by_visitor)
  where referred_by_visitor is not null;

alter table public.visitors enable row level security;

-- ---------- spins: বোনাস স্পিন আলাদা চিহ্নিত; "দিনে ১টি ফ্রি" সীমা শুধু ফ্রি স্পিনে ----------

alter table public.spins add column if not exists is_bonus boolean not null default false;
alter table public.spins drop constraint if exists spins_restaurant_id_visitor_id_spin_day_key;
create unique index if not exists spins_one_free_per_day
  on public.spins (restaurant_id, visitor_id, spin_day)
  where not is_bonus;

-- ---------- Atomic ফাংশন (একসাথে অনেক রিকোয়েস্টেও ব্যালেন্স ঠিক থাকে) ----------

-- বোনাস স্পিন খরচ: ব্যালেন্স > ০ হলে ১ কমায় এবং true দেয়
create or replace function public.consume_bonus_spin(p_restaurant uuid, p_visitor text)
returns boolean
language plpgsql
as $$
declare n integer;
begin
  update public.visitors
     set bonus_spins = bonus_spins - 1
   where restaurant_id = p_restaurant and visitor_id = p_visitor and bonus_spins > 0;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

-- স্পিন রেকর্ড ব্যর্থ হলে ফেরত দেওয়ার জন্য
create or replace function public.refund_bonus_spin(p_restaurant uuid, p_visitor text)
returns void
language sql
as $$
  update public.visitors
     set bonus_spins = least(bonus_spins + 1, 5)
   where restaurant_id = p_restaurant and visitor_id = p_visitor;
$$;

-- শেয়ারের বোনাস: ঢাকার সময়ে দিনে একবার। দেওয়া হলে true।
create or replace function public.claim_share_bonus(p_restaurant uuid, p_visitor text)
returns boolean
language plpgsql
as $$
declare
  v_today date := (now() at time zone 'Asia/Dhaka')::date;
  n integer;
begin
  update public.visitors
     set bonus_spins = least(bonus_spins + 1, 5),
         last_share_day = v_today
   where restaurant_id = p_restaurant
     and visitor_id = p_visitor
     and (last_share_day is null or last_share_day < v_today);
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

-- রেফারেল ক্রেডিট: নতুন ভিজিটর প্রথম স্পিন করলে রেফারার +১ (প্রতি ভিজিটরে একবারই)।
-- একজন রেফারার দিনে সর্বোচ্চ p_daily_cap জনের জন্য বোনাস পায় — ফার্মিং ঠেকাতে।
create or replace function public.credit_referral(p_restaurant uuid, p_visitor text, p_daily_cap integer default 3)
returns boolean
language plpgsql
as $$
declare
  v_referrer   text;
  v_day_start  timestamptz := (((now() at time zone 'Asia/Dhaka')::date)::timestamp at time zone 'Asia/Dhaka');
  v_count      integer;
begin
  update public.visitors
     set referral_credited_at = now()
   where restaurant_id = p_restaurant
     and visitor_id = p_visitor
     and referral_credited_at is null
     and referred_by_visitor is not null
  returning referred_by_visitor into v_referrer;

  if v_referrer is null then
    return false;
  end if;

  select count(*) into v_count
    from public.visitors
   where restaurant_id = p_restaurant
     and referred_by_visitor = v_referrer
     and referral_credited_at >= v_day_start;

  if v_count > p_daily_cap then
    return false;
  end if;

  update public.visitors
     set bonus_spins = least(bonus_spins + 1, 5)
   where restaurant_id = p_restaurant and visitor_id = v_referrer;
  return true;
end;
$$;

revoke all on function public.consume_bonus_spin(uuid, text)         from public, anon, authenticated;
revoke all on function public.refund_bonus_spin(uuid, text)          from public, anon, authenticated;
revoke all on function public.claim_share_bonus(uuid, text)          from public, anon, authenticated;
revoke all on function public.credit_referral(uuid, text, integer)   from public, anon, authenticated;
grant execute on function public.consume_bonus_spin(uuid, text)       to service_role;
grant execute on function public.refund_bonus_spin(uuid, text)        to service_role;
grant execute on function public.claim_share_bonus(uuid, text)        to service_role;
grant execute on function public.credit_referral(uuid, text, integer) to service_role;

-- ---------- Dashboard stats: ভিজিটর ও রেফারেল সংখ্যা যোগ ----------

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
    'total_visitors',    (select count(*) from public.visitors where restaurant_id = p_restaurant),
    'referred_visitors', (select count(*) from public.visitors where restaurant_id = p_restaurant and referred_by_visitor is not null),
    'bonus_spins_used',  (select count(*) from public.spins   where restaurant_id = p_restaurant and is_bonus),
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

revoke all on function public.restaurant_stats(uuid, integer) from public, anon, authenticated;
grant execute on function public.restaurant_stats(uuid, integer) to service_role;
