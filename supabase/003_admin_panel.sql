-- ============================================================
-- SpinReward — Migration 003: Admin Panel
-- schema.sql ও 002_viral_loop.sql চালানোর পরে Run করুন (বারবার চালানো নিরাপদ)।
--
-- ⚠️ এই মাইগ্রেশন Run না করে নতুন কোড ডিপ্লয় করবেন না:
--    স্পিন-পেজ এখন restaurants.service_until কলাম পড়ে।
--
-- যা যোগ হয়:
--  * platform_admins : কারা অ্যাডমিন (শুধু এই টেবিলের ইউজাররাই /admin-এ ঢুকতে পারে)
--  * restaurants.service_until : সেবা কতদিন পর্যন্ত চালু (নতুন রেস্টুরেন্ট = ১৪ দিন ট্রায়াল;
--    এখনকার সব রেস্টুরেন্টও আজ থেকে ১৪ দিন ট্রায়াল পাবে)
--  * payments : পেমেন্টের খাতা (bKash/Nagad/Rocket/Bank/Cash), ট্রানজেকশন আইডি অনন্য
--  * record_payment : পেমেন্ট রেকর্ড + মেয়াদ বাড়ানো একসাথে (atomic)
--  * platform_stats / admin_restaurants : অ্যাডমিন ড্যাশবোর্ডের ডেটা
-- ============================================================

-- ---------- অ্যাডমিন তালিকা ----------

create table if not exists public.platform_admins (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);
alter table public.platform_admins enable row level security;

-- ---------- সেবার মেয়াদ ----------

alter table public.restaurants
  add column if not exists service_until timestamptz not null default (now() + interval '14 days');

create index if not exists restaurants_service_until_idx on public.restaurants (service_until);

-- ---------- পেমেন্ট ----------
-- on delete restrict: পেমেন্টের ইতিহাস থাকা রেস্টুরেন্ট মুছে ফেলা যাবে না (বদলে suspend করুন)।

create table if not exists public.payments (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete restrict,
  amount         integer not null check (amount > 0),
  plan           text not null check (plan in ('basic', 'standard', 'premium')),
  method         text not null check (method in ('bkash', 'nagad', 'rocket', 'bank', 'cash', 'other')),
  reference      text check (reference is null or char_length(reference) between 3 and 64),
  period_days    integer not null default 30 check (period_days between 1 and 366),
  note           text check (note is null or char_length(note) <= 300),
  recorded_by    uuid references auth.users(id) on delete set null,
  paid_at        timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

-- একই ট্রানজেকশন আইডি দুইবার এন্ট্রি ঠেকায় (যেমন একই bKash TrxID)
create unique index if not exists payments_method_reference_uniq
  on public.payments (method, reference) where reference is not null;
create index if not exists payments_restaurant_paid_idx on public.payments (restaurant_id, paid_at desc);
create index if not exists payments_paid_idx on public.payments (paid_at desc);

alter table public.payments enable row level security;

-- ---------- পেমেন্ট রেকর্ড + মেয়াদ বাড়ানো (atomic) ----------
-- নতুন মেয়াদ = max(পুরনো মেয়াদ, এখন) + period_days
-- (আগে থেকে মেয়াদ থাকলে বাকি দিন হারায় না; মেয়াদ শেষ হয়ে গেলে আজ থেকে গোনা শুরু)

create or replace function public.record_payment(
  p_restaurant  uuid,
  p_amount      integer,
  p_plan        text,
  p_method      text,
  p_reference   text,
  p_period_days integer,
  p_note        text,
  p_admin       uuid
)
returns jsonb
language plpgsql
as $$
declare
  v_payment_id uuid;
  v_until      timestamptz;
begin
  perform 1 from public.restaurants where id = p_restaurant for update;
  if not found then
    raise exception 'restaurant not found' using errcode = 'P0002';
  end if;

  insert into public.payments (restaurant_id, amount, plan, method, reference, period_days, note, recorded_by)
  values (p_restaurant, p_amount, p_plan, p_method, nullif(btrim(p_reference), ''), p_period_days, nullif(btrim(p_note), ''), p_admin)
  returning id into v_payment_id;

  update public.restaurants
     set plan = p_plan,
         service_until = greatest(service_until, now()) + make_interval(days => p_period_days)
   where id = p_restaurant
  returning service_until into v_until;

  return jsonb_build_object('payment_id', v_payment_id, 'service_until', v_until);
end;
$$;

-- ---------- অ্যাডমিনের রেস্টুরেন্ট তালিকা (মালিকের ইমেইল সহ) ----------
-- security definer: auth.users পড়তে হয়। search_path খালি রাখা হয়েছে, সব নাম পূর্ণ-যোগ্য।

create or replace function public.admin_restaurants()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(t.j order by t.created_at desc), '[]'::jsonb)
  from (
    select
      r.created_at,
      jsonb_build_object(
        'id', r.id,
        'name', r.name,
        'slug', r.slug,
        'plan', r.plan,
        'is_active', r.is_active,
        'service_until', r.service_until,
        'created_at', r.created_at,
        'owner_email', u.email,
        'spins', (select count(*) from public.spins s where s.restaurant_id = r.id),
        'payments_count', (select count(*) from public.payments p where p.restaurant_id = r.id),
        'last_payment_at', (select max(p.paid_at) from public.payments p where p.restaurant_id = r.id)
      ) as j
    from public.restaurants r
    left join auth.users u on u.id = r.owner_id
  ) t;
$$;

-- ---------- প্ল্যাটফর্মের সার্বিক পরিসংখ্যান ----------
-- MRR এখানে নয়: দাম TypeScript (src/lib/plans.ts)-এ এক জায়গায় থাকে, তাই এখানে শুধু
-- প্ল্যানভেদে "পেমেন্টকারী সক্রিয় রেস্টুরেন্ট" সংখ্যা দিই।

create or replace function public.platform_stats(p_days integer default 14)
returns jsonb
language sql
stable
as $$
  with
  paying as (
    select r.id, r.plan
    from public.restaurants r
    where r.is_active and r.service_until > now()
      and exists (select 1 from public.payments p where p.restaurant_id = r.id)
  ),
  days as (
    select d::date as day
    from generate_series(
      ((now() at time zone 'Asia/Dhaka')::date - (p_days - 1))::timestamp,
      (now() at time zone 'Asia/Dhaka')::date::timestamp,
      interval '1 day'
    ) as d
  ),
  spin_counts as (
    select (created_at at time zone 'Asia/Dhaka')::date as day, count(*) as c
    from public.spins group by 1
  ),
  redeem_counts as (
    select (redeemed_at at time zone 'Asia/Dhaka')::date as day, count(*) as c
    from public.coupons where redeemed_at is not null group by 1
  ),
  months as (
    select m::date as month_start
    from generate_series(
      date_trunc('month', now() at time zone 'Asia/Dhaka') - interval '5 months',
      date_trunc('month', now() at time zone 'Asia/Dhaka'),
      interval '1 month'
    ) as m
  ),
  month_rev as (
    select date_trunc('month', paid_at at time zone 'Asia/Dhaka')::date as month_start, sum(amount)::bigint as amt
    from public.payments group by 1
  )
  select jsonb_build_object(
    'restaurants_total',     (select count(*) from public.restaurants),
    'restaurants_suspended', (select count(*) from public.restaurants where not is_active),
    'restaurants_expired',   (select count(*) from public.restaurants where is_active and service_until <= now()),
    'restaurants_paying',    (select count(*) from paying),
    'restaurants_trial',     (select count(*) from public.restaurants r
                               where r.is_active and r.service_until > now()
                                 and not exists (select 1 from public.payments p where p.restaurant_id = r.id)),
    'expiring_soon',         (select count(*) from public.restaurants
                               where is_active and service_until > now() and service_until <= now() + interval '7 days'),
    'paying_by_plan', jsonb_build_object(
      'basic',    (select count(*) from paying where plan = 'basic'),
      'standard', (select count(*) from paying where plan = 'standard'),
      'premium',  (select count(*) from paying where plan = 'premium')
    ),
    'revenue_total', coalesce((select sum(amount) from public.payments), 0),
    'revenue_month', coalesce((
      select sum(amount) from public.payments
      where date_trunc('month', paid_at at time zone 'Asia/Dhaka') = date_trunc('month', now() at time zone 'Asia/Dhaka')
    ), 0),
    'revenue_by_month', (
      select coalesce(jsonb_agg(
        jsonb_build_object('month', to_char(m.month_start, 'YYYY-MM'), 'amount', coalesce(mr.amt, 0))
        order by m.month_start
      ), '[]'::jsonb)
      from months m left join month_rev mr on mr.month_start = m.month_start
    ),
    'total_spins',       (select count(*) from public.spins),
    'total_coupons',     (select count(*) from public.coupons),
    'total_redemptions', (select count(*) from public.coupons where status = 'redeemed'),
    'total_visitors',    (select count(*) from public.visitors),
    'referred_visitors', (select count(*) from public.visitors where referred_by_visitor is not null),
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
    ),
    'top_restaurants', (
      select coalesce(jsonb_agg(x.j order by x.spins desc, x.name), '[]'::jsonb)
      from (
        select r.name, count(*) as spins,
               jsonb_build_object('name', r.name, 'slug', r.slug, 'spins', count(*)) as j
        from public.spins s join public.restaurants r on r.id = s.restaurant_id
        where s.created_at >= now() - interval '30 days'
        group by r.id, r.name, r.slug
        order by count(*) desc, r.name
        limit 5
      ) x
    )
  );
$$;

-- সব ফাংশন শুধু service role (সার্ভার API) চালাতে পারবে
revoke all on function public.record_payment(uuid, integer, text, text, text, integer, text, uuid) from public, anon, authenticated;
revoke all on function public.admin_restaurants() from public, anon, authenticated;
revoke all on function public.platform_stats(integer) from public, anon, authenticated;
grant execute on function public.record_payment(uuid, integer, text, text, text, integer, text, uuid) to service_role;
grant execute on function public.admin_restaurants() to service_role;
grant execute on function public.platform_stats(integer) to service_role;

-- ============================================================
-- প্রথম অ্যাডমিন বানাতে (একবার, SQL Editor-এ):
--   1) Authentication → Users → Add user দিয়ে আপনার অ্যাডমিন ইউজার বানান
--   2) নিচেরটা Run করুন (আপনার ইমেইল বসিয়ে):
--
--   insert into public.platform_admins (user_id)
--   select id from auth.users where email = 'you@example.com';
-- ============================================================
