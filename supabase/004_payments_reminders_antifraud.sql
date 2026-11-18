-- ============================================================
-- SpinReward — Migration 004: পেমেন্ট নবায়ন, মেয়াদ-রিমাইন্ডার, অ্যান্টি-ফ্রড
-- schema.sql → 002 → 003 চালানোর পরে Run করুন (বারবার চালানো নিরাপদ)।
--
-- যা যোগ হয়:
--  * rate_limits + hit_rate_limit : IP-ভিত্তিক burst সীমা (গোপনীয়তার জন্য শুধু IP-র হ্যাশ)
--  * visitors.ip_hash / last_ip_hash, spins.ip_hash : দৈনিক IP সীমা ও রেফারেল-ফার্মিং ঠেকাতে
--  * credit_referral (নতুন সংস্করণ) : রেফারেল দেওয়া ও পাওয়া ডিভাইস একই IP-তে হলে বোনাস নেই
--  * payment_requests : মালিক নিজে TrxID জমা দেয়, অ্যাডমিন এক ক্লিকে অনুমোদন/বাতিল
--  * reminder_log + due_reminders : মেয়াদ শেষের ৭/৩/১ দিন আগে ও পরে ইমেইল, কখনও দুইবার নয়
-- ============================================================

-- ====================== অ্যান্টি-ফ্রড ======================

create table if not exists public.rate_limits (
  key           text primary key,
  window_start  timestamptz not null default now(),
  hits          integer not null default 0
);
alter table public.rate_limits enable row level security;

-- নির্দিষ্ট সময়-জানালায় (fixed window) সর্বোচ্চ p_max বার। সীমার মধ্যে থাকলে true।
create or replace function public.hit_rate_limit(p_key text, p_window_seconds integer, p_max integer)
returns boolean
language plpgsql
as $$
declare
  v_hits integer;
begin
  insert into public.rate_limits as rl (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update
    set window_start = case when rl.window_start < now() - make_interval(secs => p_window_seconds)
                            then now() else rl.window_start end,
        hits         = case when rl.window_start < now() - make_interval(secs => p_window_seconds)
                            then 1 else rl.hits + 1 end
  returning rl.hits into v_hits;
  return v_hits <= p_max;
end;
$$;

-- পুরনো সারি মুছে টেবিল ছোট রাখে (দৈনিক cron ডাকে)
create or replace function public.purge_rate_limits()
returns integer
language plpgsql
as $$
declare n integer;
begin
  delete from public.rate_limits where window_start < now() - interval '1 day';
  get diagnostics n = row_count;
  return n;
end;
$$;

alter table public.visitors add column if not exists ip_hash      text;  -- প্রথমবার দেখা IP
alter table public.visitors add column if not exists last_ip_hash text;  -- সর্বশেষ IP
alter table public.spins    add column if not exists ip_hash      text;

create index if not exists spins_ip_day_idx
  on public.spins (restaurant_id, ip_hash, spin_day) where ip_hash is not null;

-- referral_rewarded: বোনাস *আসলেই* দেওয়া হয়েছে কি (দৈনিক সীমা শুধু এগুলো গোনে)।
-- পুরনো ডেটা: যেগুলোর ক্রেডিট প্রক্রিয়া হয়ে গেছে সেগুলো rewarded ধরা হয় — শুধু প্রথমবার কলাম বসার সময়।
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'visitors' and column_name = 'referral_rewarded'
  ) then
    alter table public.visitors add column referral_rewarded boolean not null default false;
    update public.visitors set referral_rewarded = true where referral_credited_at is not null;
  end if;
end $$;

-- রেফারেল ক্রেডিট (নতুন সংস্করণ): নতুন ভিজিটরের প্রথম স্পিনে রেফারার +১।
--  * রেফারি ও রেফারার একই IP-তে (প্রথম/সর্বশেষ যেকোনোটিতে মিললে) → বোনাস নেই (নিজের ইনকগনিটো ট্যাব দিয়ে ফার্মিং)
--  * দিনে একজন রেফারার সর্বোচ্চ p_daily_cap জনের বোনাস পায়; ব্লক হওয়াগুলো সীমা খরচ করে না
--  * প্রতি রেফারি একবারই প্রক্রিয়া হয় (ব্লক হলেও), তাই পরে IP বদলে আবার চেষ্টা চলে না
drop function if exists public.credit_referral(uuid, text, integer);

create or replace function public.credit_referral(
  p_restaurant uuid,
  p_visitor    text,
  p_daily_cap  integer default 3,
  p_ip         text default null
)
returns boolean
language plpgsql
as $$
declare
  v_referrer    text;
  v_my_ip       text;
  v_ref_ip      text;
  v_ref_last_ip text;
  v_day_start   timestamptz := (((now() at time zone 'Asia/Dhaka')::date)::timestamp at time zone 'Asia/Dhaka');
  v_count       integer;
begin
  update public.visitors
     set referral_credited_at = now()
   where restaurant_id = p_restaurant
     and visitor_id = p_visitor
     and referral_credited_at is null
     and referred_by_visitor is not null
  returning referred_by_visitor, ip_hash into v_referrer, v_my_ip;

  if v_referrer is null then
    return false;
  end if;

  select ip_hash, last_ip_hash into v_ref_ip, v_ref_last_ip
    from public.visitors
   where restaurant_id = p_restaurant and visitor_id = v_referrer;

  -- একই IP-তে থেকে নিজেকে রেফার করা
  if (v_my_ip is not null and (v_my_ip = v_ref_ip or v_my_ip = v_ref_last_ip))
     or (p_ip is not null and (p_ip = v_ref_ip or p_ip = v_ref_last_ip)) then
    return false;
  end if;

  select count(*) into v_count
    from public.visitors
   where restaurant_id = p_restaurant
     and referred_by_visitor = v_referrer
     and referral_rewarded
     and referral_credited_at >= v_day_start;

  if v_count >= p_daily_cap then
    return false;
  end if;

  update public.visitors set referral_rewarded = true
   where restaurant_id = p_restaurant and visitor_id = p_visitor;

  update public.visitors
     set bonus_spins = least(bonus_spins + 1, 5)
   where restaurant_id = p_restaurant and visitor_id = v_referrer;
  return true;
end;
$$;

-- ====================== পেমেন্ট নবায়ন (মালিকের অনুরোধ) ======================

create table if not exists public.payment_requests (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  plan           text not null check (plan in ('basic', 'standard', 'premium')),
  amount         integer not null check (amount > 0),
  method         text not null check (method in ('bkash', 'nagad', 'rocket', 'bank')),
  reference      text not null check (char_length(reference) between 3 and 64),
  period_days    integer not null default 30 check (period_days between 1 and 366),
  note           text check (note is null or char_length(note) <= 200),
  status         text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note     text check (admin_note is null or char_length(admin_note) <= 300),
  payment_id     uuid references public.payments(id) on delete set null,
  reviewed_by    uuid references auth.users(id) on delete set null,
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now()
);

-- একই TrxID দুটি খোলা/অনুমোদিত অনুরোধে থাকতে পারে না (বাতিল হলে আবার জমা দেওয়া যায়)
create unique index if not exists payment_requests_open_ref_uniq
  on public.payment_requests (method, reference) where status <> 'rejected';
create index if not exists payment_requests_status_idx on public.payment_requests (status, created_at desc);
create index if not exists payment_requests_restaurant_idx on public.payment_requests (restaurant_id, created_at desc);

alter table public.payment_requests enable row level security;

-- অনুরোধ জমা। ত্রুটি-কোড: P0002 = রেস্টুরেন্ট নেই, P0004 = ৩টির বেশি অপেক্ষমাণ, 23505 = TrxID আগেই আছে
create or replace function public.submit_payment_request(
  p_restaurant  uuid,
  p_plan        text,
  p_amount      integer,
  p_method      text,
  p_reference   text,
  p_period_days integer,
  p_note        text
)
returns uuid
language plpgsql
as $$
declare
  v_id  uuid;
  v_ref text := upper(btrim(p_reference));
begin
  perform 1 from public.restaurants where id = p_restaurant for update;
  if not found then
    raise exception 'restaurant not found' using errcode = 'P0002';
  end if;

  if (select count(*) from public.payment_requests where restaurant_id = p_restaurant and status = 'pending') >= 3 then
    raise exception 'too many pending requests' using errcode = 'P0004';
  end if;

  if exists (select 1 from public.payments where method = p_method and upper(reference) = v_ref) then
    raise exception 'duplicate reference' using errcode = '23505';
  end if;

  insert into public.payment_requests (restaurant_id, plan, amount, method, reference, period_days, note)
  values (p_restaurant, p_plan, p_amount, p_method, v_ref, p_period_days, nullif(btrim(p_note), ''))
  returning id into v_id;
  return v_id;
end;
$$;

-- অ্যাডমিনের সিদ্ধান্ত। অনুমোদনে record_payment চলে (খাতায় এন্ট্রি + মেয়াদ বাড়া) — সবটাই একটি ট্রানজেকশনে।
-- ত্রুটি-কোড: P0002 = অনুরোধ নেই, P0003 = আগেই যাচাই হয়েছে, 23505 = TrxID খাতায় আগেই আছে (অনুরোধ pending-ই থাকে)
create or replace function public.review_payment_request(
  p_request    uuid,
  p_admin      uuid,
  p_approve    boolean,
  p_admin_note text
)
returns jsonb
language plpgsql
as $$
declare
  r        public.payment_requests%rowtype;
  v_result jsonb;
begin
  select * into r from public.payment_requests where id = p_request for update;
  if not found then
    raise exception 'request not found' using errcode = 'P0002';
  end if;
  if r.status <> 'pending' then
    raise exception 'already reviewed' using errcode = 'P0003';
  end if;

  if p_approve then
    v_result := public.record_payment(r.restaurant_id, r.amount, r.plan, r.method, r.reference, r.period_days, r.note, p_admin);
    update public.payment_requests
       set status = 'approved',
           payment_id = (v_result ->> 'payment_id')::uuid,
           reviewed_by = p_admin,
           reviewed_at = now(),
           admin_note = nullif(btrim(p_admin_note), '')
     where id = r.id;
    return v_result || jsonb_build_object('status', 'approved');
  end if;

  update public.payment_requests
     set status = 'rejected',
         reviewed_by = p_admin,
         reviewed_at = now(),
         admin_note = nullif(btrim(p_admin_note), '')
   where id = r.id;
  return jsonb_build_object('status', 'rejected');
end;
$$;

-- ====================== মেয়াদ-রিমাইন্ডার ======================

-- (রেস্টুরেন্ট, ধরন, মেয়াদের তারিখ) প্রতি একবারই; নবায়নে মেয়াদ বদলালে নতুন চক্র শুরু হয়
create table if not exists public.reminder_log (
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  kind           text not null check (kind in ('d7', 'd3', 'd1', 'expired')),
  service_until  timestamptz not null,
  sent_at        timestamptz not null default now(),
  primary key (restaurant_id, kind, service_until)
);
alter table public.reminder_log enable row level security;

-- এখন যাদের ইমেইল পাঠানো বাকি। জানালাগুলো আলাদা, তাই প্রতি রেস্টুরেন্টে একটিই ধরন:
--   d7 = ৩–৭ দিন বাকি, d3 = ১–৩ দিন, d1 = ২৪ ঘণ্টার কম, expired = শেষ হয়েছে (শুধু ৩ দিন পর্যন্ত)
-- স্থগিত রেস্টুরেন্ট ও মালিকহীন রেস্টুরেন্ট বাদ।
create or replace function public.due_reminders()
returns table (restaurant_id uuid, name text, slug text, owner_email text, service_until timestamptz, kind text)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.name, r.slug, u.email::text, r.service_until, k.kind
  from public.restaurants r
  join auth.users u on u.id = r.owner_id
  cross join lateral (
    select case
      when r.service_until <= now()                      then 'expired'
      when r.service_until <= now() + interval '1 day'   then 'd1'
      when r.service_until <= now() + interval '3 days'  then 'd3'
      when r.service_until <= now() + interval '7 days'  then 'd7'
    end as kind
  ) k
  where r.is_active
    and u.email is not null
    and k.kind is not null
    and (k.kind <> 'expired' or r.service_until > now() - interval '3 days')
    and not exists (
      select 1 from public.reminder_log l
      where l.restaurant_id = r.id and l.kind = k.kind and l.service_until = r.service_until
    );
$$;

-- পাঠানোর আগে "দখল" (একসাথে দুটি cron চললেও একই ইমেইল দুইবার যায় না); পাঠানো ব্যর্থ হলে release
create or replace function public.claim_reminder(p_restaurant uuid, p_kind text, p_service_until timestamptz)
returns boolean
language plpgsql
as $$
declare n integer;
begin
  insert into public.reminder_log (restaurant_id, kind, service_until)
  values (p_restaurant, p_kind, p_service_until)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

create or replace function public.release_reminder(p_restaurant uuid, p_kind text, p_service_until timestamptz)
returns void
language sql
as $$
  delete from public.reminder_log
   where restaurant_id = p_restaurant and kind = p_kind and service_until = p_service_until;
$$;

-- ====================== অনুমতি: সব ফাংশন শুধু service role ======================

revoke all on function public.hit_rate_limit(text, integer, integer)                      from public, anon, authenticated;
revoke all on function public.purge_rate_limits()                                         from public, anon, authenticated;
revoke all on function public.credit_referral(uuid, text, integer, text)                  from public, anon, authenticated;
revoke all on function public.submit_payment_request(uuid, text, integer, text, text, integer, text) from public, anon, authenticated;
revoke all on function public.review_payment_request(uuid, uuid, boolean, text)           from public, anon, authenticated;
revoke all on function public.due_reminders()                                             from public, anon, authenticated;
revoke all on function public.claim_reminder(uuid, text, timestamptz)                     from public, anon, authenticated;
revoke all on function public.release_reminder(uuid, text, timestamptz)                   from public, anon, authenticated;

grant execute on function public.hit_rate_limit(text, integer, integer)                   to service_role;
grant execute on function public.purge_rate_limits()                                      to service_role;
grant execute on function public.credit_referral(uuid, text, integer, text)               to service_role;
grant execute on function public.submit_payment_request(uuid, text, integer, text, text, integer, text) to service_role;
grant execute on function public.review_payment_request(uuid, uuid, boolean, text)        to service_role;
grant execute on function public.due_reminders()                                          to service_role;
grant execute on function public.claim_reminder(uuid, text, timestamptz)                  to service_role;
grant execute on function public.release_reminder(uuid, text, timestamptz)                to service_role;
