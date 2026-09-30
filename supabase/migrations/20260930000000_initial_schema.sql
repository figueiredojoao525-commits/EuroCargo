-- ════════════════════════════════════════════════════════════════════
-- EuroCargo — initial schema
--
-- Security model
--   * Row Level Security is enabled on every table.
--   * The browser (anon / authenticated roles) can only:
--       - read rows it is allowed to see (RLS);
--       - update a limited set of its own profile columns;
--       - insert shipments with customer-provided columns only;
--       - call a small set of SECURITY DEFINER functions that validate
--         everything server-side.
--   * Payments can only be confirmed by `confirm_tracking_payment`, which is
--     executable exclusively by `service_role` (the payment webhook).
--   * Admin rights come from `profiles.role`, which clients cannot change.
-- ════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto with schema extensions;

-- ─────────────── Enums ───────────────
create type public.user_role as enum ('client', 'admin');

create type public.shipment_status as enum (
  'created',
  'payment_pending',
  'tracking_ready',
  'pickup_requested',
  'picked_up',
  'in_transit',
  'distribution_center',
  'out_for_delivery',
  'delivered',
  'cancelled'
);

create type public.payment_status as enum ('pending', 'paid', 'failed', 'refunded');

-- ─────────────── Helpers ───────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ─────────────── profiles ───────────────
create table public.profiles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references auth.users (id) on delete cascade,
  full_name   text check (char_length(full_name) <= 120),
  phone       text check (char_length(phone) <= 30),
  country     text check (country ~ '^[A-Z]{2}$'),
  role        public.user_role not null default 'client',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index profiles_role_idx on public.profiles (role);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Creates the profile when a user signs up. The role is always 'client';
-- user-supplied metadata is never used to grant privileges.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_country text := upper(new.raw_user_meta_data ->> 'country');
begin
  insert into public.profiles (user_id, full_name, phone, country)
  values (
    new.id,
    left(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 120),
    left(nullif(trim(new.raw_user_meta_data ->> 'phone'), ''), 30),
    case when v_country ~ '^[A-Z]{2}$' then v_country end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- True when the current user is an administrator. SECURITY DEFINER so it can be
-- used inside RLS policies without recursive policy evaluation on profiles.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where user_id = (select auth.uid()) and role = 'admin'
  );
$$;

-- ─────────────── shipments ───────────────
create table public.shipments (
  id                   uuid primary key default gen_random_uuid(),
  tracking_code        text unique,
  user_id              uuid default auth.uid() references auth.users (id) on delete set null,

  sender_name          text not null check (char_length(sender_name) between 2 and 120),
  sender_phone         text not null check (char_length(sender_phone) between 6 and 30),
  sender_country       text not null check (sender_country ~ '^[A-Z]{2}$'),
  sender_city          text not null check (char_length(sender_city) between 2 and 100),
  sender_address       text not null check (char_length(sender_address) between 5 and 250),

  recipient_name       text not null check (char_length(recipient_name) between 2 and 120),
  recipient_phone      text not null check (char_length(recipient_phone) between 6 and 30),
  recipient_country    text not null check (recipient_country ~ '^[A-Z]{2}$'),
  recipient_city       text not null check (char_length(recipient_city) between 2 and 100),
  recipient_address    text not null check (char_length(recipient_address) between 5 and 250),

  package_description  text not null check (char_length(package_description) between 3 and 500),
  package_weight       numeric(8, 2) not null check (package_weight > 0 and package_weight <= 1000),
  notes                text check (char_length(notes) <= 1000),

  status               public.shipment_status not null default 'created',
  tracking_fee         numeric(10, 2) not null default 1.00 check (tracking_fee > 0),
  tracking_fee_paid    boolean not null default false,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint shipments_tracking_code_format
    check (tracking_code is null or tracking_code ~ '^EC-[A-Z]{2}-[0-9]{4}-[A-Z0-9]{6}$'),
  -- A tracking code can only exist once the fee has been paid.
  constraint shipments_tracking_code_requires_payment
    check (tracking_code is null or tracking_fee_paid)
);

-- tracking_code already has a unique index (from the UNIQUE constraint).
create index shipments_user_id_idx on public.shipments (user_id);
create index shipments_status_idx on public.shipments (status);
create index shipments_created_at_idx on public.shipments (created_at desc);

create trigger shipments_set_updated_at
  before update on public.shipments
  for each row execute function public.set_updated_at();

-- ─────────────── shipment_events ───────────────
create table public.shipment_events (
  id           uuid primary key default gen_random_uuid(),
  shipment_id  uuid not null references public.shipments (id) on delete cascade,
  status       public.shipment_status not null,
  location     text check (char_length(location) <= 150),
  description  text check (char_length(description) <= 500),
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null
);

create index shipment_events_shipment_id_idx on public.shipment_events (shipment_id, created_at desc);
create index shipment_events_status_idx on public.shipment_events (status);

-- Every new shipment starts its history with a 'created' event.
create or replace function public.handle_new_shipment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.shipment_events (shipment_id, status, created_by)
  values (new.id, new.status, auth.uid());
  return new;
end;
$$;

create trigger on_shipment_created
  after insert on public.shipments
  for each row execute function public.handle_new_shipment();

-- ─────────────── payments ───────────────
create table public.payments (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid references auth.users (id) on delete set null,
  shipment_id          uuid not null references public.shipments (id) on delete restrict,
  amount               numeric(10, 2) not null check (amount > 0),
  currency             text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  status               public.payment_status not null default 'pending',
  provider             text,
  provider_payment_id  text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint payments_provider_payment_id_unique unique (provider, provider_payment_id)
);

create index payments_user_id_idx on public.payments (user_id);
create index payments_shipment_id_idx on public.payments (shipment_id);
create index payments_status_idx on public.payments (status);
-- At most one open (pending) or successful (paid) tracking payment per shipment.
create unique index payments_one_active_per_shipment
  on public.payments (shipment_id) where status in ('pending', 'paid');

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

-- ─────────────── admin_actions ───────────────
create table public.admin_actions (
  id             uuid primary key default gen_random_uuid(),
  admin_user_id  uuid references auth.users (id) on delete set null,
  shipment_id    uuid references public.shipments (id) on delete set null,
  action         text not null,
  details        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index admin_actions_shipment_id_idx on public.admin_actions (shipment_id);
create index admin_actions_admin_user_id_idx on public.admin_actions (admin_user_id);

-- ════════════════════════════════════════════════════════════════════
-- Row Level Security
-- ════════════════════════════════════════════════════════════════════
alter table public.profiles        enable row level security;
alter table public.shipments       enable row level security;
alter table public.shipment_events enable row level security;
alter table public.payments        enable row level security;
alter table public.admin_actions   enable row level security;

-- profiles
create policy "profiles: read own or admin" on public.profiles
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- shipments
create policy "shipments: read own or admin" on public.shipments
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy "shipments: create own" on public.shipments
  for insert to authenticated
  with check (user_id = (select auth.uid()));
-- No UPDATE/DELETE policies: status changes go through admin_add_shipment_event()
-- and payment confirmation through confirm_tracking_payment().

-- shipment_events (read-only for clients; written by functions/triggers)
create policy "shipment_events: read own or admin" on public.shipment_events
  for select to authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1 from public.shipments s
      where s.id = shipment_events.shipment_id and s.user_id = (select auth.uid())
    )
  );

-- payments (read-only for clients; written by functions / service role)
create policy "payments: read own or admin" on public.payments
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- admin_actions (admins only)
create policy "admin_actions: read admin" on public.admin_actions
  for select to authenticated
  using ((select public.is_admin()));

-- ════════════════════════════════════════════════════════════════════
-- Table privileges (defence in depth on top of RLS)
-- Supabase grants ALL to anon/authenticated by default; restrict that.
-- ════════════════════════════════════════════════════════════════════
revoke all on public.profiles, public.shipments, public.shipment_events,
              public.payments, public.admin_actions
  from anon, authenticated;

grant select on public.profiles, public.shipments, public.shipment_events,
                public.payments, public.admin_actions
  to authenticated;

-- Clients may only edit these profile columns (never `role`).
grant update (full_name, phone, country) on public.profiles to authenticated;

-- Clients may only provide these shipment columns. status, tracking_code,
-- tracking_fee and tracking_fee_paid always take their server-side defaults.
grant insert (
  sender_name, sender_phone, sender_country, sender_city, sender_address,
  recipient_name, recipient_phone, recipient_country, recipient_city, recipient_address,
  package_description, package_weight, notes
) on public.shipments to authenticated;

-- ════════════════════════════════════════════════════════════════════
-- Business functions
-- ════════════════════════════════════════════════════════════════════

-- Cryptographically random tracking code: EC-<CC>-<YYYY>-<6 chars>.
-- Alphabet has 32 symbols (no 0/O/1/I) → ~1.07 billion combinations per
-- country and year; 256 is divisible by 32 so there is no modulo bias.
create or replace function public.generate_tracking_code(p_country text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_bytes  bytea;
  v_suffix text;
  v_code   text;
begin
  if p_country !~ '^[A-Z]{2}$' then
    raise exception 'invalid_country';
  end if;

  loop
    v_bytes := extensions.gen_random_bytes(6);
    v_suffix := '';
    for i in 0..5 loop
      v_suffix := v_suffix || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
    end loop;
    v_code := 'EC-' || p_country || '-' || to_char(now() at time zone 'UTC', 'YYYY') || '-' || v_suffix;
    exit when not exists (select 1 from public.shipments where tracking_code = v_code);
  end loop;

  return v_code;
end;
$$;

-- Called by the customer to start the €1 tracking-code request.
-- Creates (or reuses) a pending payment whose amount is taken from the
-- server-side shipments.tracking_fee — the browser never sends an amount.
create or replace function public.request_tracking_code(p_shipment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_shipment   public.shipments;
  v_payment_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_shipment
  from public.shipments
  where id = p_shipment_id and user_id = v_uid
  for update;

  if not found then
    raise exception 'shipment_not_found';
  end if;
  if v_shipment.tracking_fee_paid then
    raise exception 'tracking_already_paid';
  end if;
  if v_shipment.status = 'cancelled' then
    raise exception 'shipment_cancelled';
  end if;

  select id into v_payment_id
  from public.payments
  where shipment_id = p_shipment_id and status = 'pending';

  if v_payment_id is null then
    insert into public.payments (user_id, shipment_id, amount, currency)
    values (v_uid, p_shipment_id, v_shipment.tracking_fee, 'EUR')
    returning id into v_payment_id;
  end if;

  if v_shipment.status = 'created' then
    update public.shipments set status = 'payment_pending' where id = p_shipment_id;
    insert into public.shipment_events (shipment_id, status, created_by)
    values (p_shipment_id, 'payment_pending', v_uid);
  end if;

  return v_payment_id;
end;
$$;

-- Called ONLY by the payment webhook (service_role) after the provider's
-- signed notification has been verified. Validates amount and currency,
-- marks the payment as paid and generates the tracking code atomically.
-- Idempotent: providers may deliver the same webhook more than once.
create or replace function public.confirm_tracking_payment(
  p_payment_id          uuid,
  p_provider            text,
  p_provider_payment_id text,
  p_amount              numeric,
  p_currency            text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment  public.payments;
  v_shipment public.shipments;
  v_code     text;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'payment_not_found';
  end if;

  if v_payment.status = 'paid' then
    select tracking_code into v_code from public.shipments where id = v_payment.shipment_id;
    return v_code;
  end if;

  if v_payment.status <> 'pending' then
    raise exception 'payment_not_pending';
  end if;

  if p_amount is distinct from v_payment.amount
     or upper(p_currency) is distinct from v_payment.currency then
    raise exception 'payment_amount_mismatch';
  end if;

  select * into v_shipment from public.shipments where id = v_payment.shipment_id for update;

  update public.payments
  set status = 'paid', provider = p_provider, provider_payment_id = p_provider_payment_id
  where id = p_payment_id;

  v_code := coalesce(v_shipment.tracking_code, public.generate_tracking_code(v_shipment.sender_country));

  update public.shipments
  set tracking_code = v_code,
      tracking_fee_paid = true,
      status = case when status in ('created', 'payment_pending') then 'tracking_ready'::public.shipment_status
                    else status end
  where id = v_shipment.id;

  if v_shipment.status in ('created', 'payment_pending') then
    insert into public.shipment_events (shipment_id, status)
    values (v_shipment.id, 'tracking_ready');
  end if;

  return v_code;
end;
$$;

-- Called ONLY by the payment webhook when a checkout expires or fails.
-- The customer can then start a new request. Only acts when the notification
-- refers to the checkout session currently attached to the payment, so a late
-- "expired" event for an older session cannot cancel a newer, open one.
create or replace function public.mark_payment_failed(
  p_payment_id          uuid,
  p_provider            text,
  p_provider_payment_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.payments
  set status = 'failed',
      provider = coalesce(p_provider, provider),
      provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id)
  where id = p_payment_id
    and status = 'pending'
    and (provider_payment_id is null or provider_payment_id = p_provider_payment_id);
end;
$$;

-- Public tracking lookup (anyone with the code). Returns only non-personal
-- data: no names, phones or addresses. NULL when the code does not exist.
create or replace function public.get_tracking(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'tracking_code',       s.tracking_code,
    'status',              s.status,
    'origin_city',         s.sender_city,
    'origin_country',      s.sender_country,
    'destination_city',    s.recipient_city,
    'destination_country', s.recipient_country,
    'created_at',          s.created_at,
    'last_update',         greatest(s.updated_at, coalesce(max(e.created_at), s.updated_at)),
    'events', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'status',      e.status,
          'location',    e.location,
          'description', e.description,
          'created_at',  e.created_at
        ) order by e.created_at desc
      ) filter (where e.id is not null),
      '[]'::jsonb
    )
  )
  from public.shipments s
  left join public.shipment_events e on e.shipment_id = s.id
  where s.tracking_code = upper(trim(p_code))
    and s.tracking_fee_paid
  group by s.id;
$$;

-- Admin: add an event (location/description) and optionally change the status.
-- Status change, history event and audit log are written in one transaction.
create or replace function public.admin_add_shipment_event(
  p_shipment_id uuid,
  p_status      public.shipment_status,
  p_location    text default null,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid         uuid := auth.uid();
  v_old_status  public.shipment_status;
  v_location    text := nullif(trim(p_location), '');
  v_description text := nullif(trim(p_description), '');
  v_event_id    uuid;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select status into v_old_status from public.shipments where id = p_shipment_id for update;
  if not found then
    raise exception 'shipment_not_found';
  end if;

  -- Payment-related statuses are managed exclusively by the payment flow.
  if p_status <> v_old_status and p_status in ('created', 'payment_pending', 'tracking_ready') then
    raise exception 'status_managed_by_system';
  end if;

  if p_status = v_old_status and v_location is null and v_description is null then
    raise exception 'empty_update';
  end if;

  if p_status <> v_old_status then
    update public.shipments set status = p_status where id = p_shipment_id;
  end if;

  insert into public.shipment_events (shipment_id, status, location, description, created_by)
  values (p_shipment_id, p_status, v_location, v_description, v_uid)
  returning id into v_event_id;

  insert into public.admin_actions (admin_user_id, shipment_id, action, details)
  values (
    v_uid,
    p_shipment_id,
    case when p_status <> v_old_status then 'status_changed' else 'event_added' end,
    jsonb_build_object(
      'from', v_old_status,
      'to', p_status,
      'location', v_location,
      'description', v_description,
      'event_id', v_event_id
    )
  );

  return v_event_id;
end;
$$;

-- Admin dashboard counters in a single round-trip.
create or replace function public.admin_dashboard_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'total',       (select count(*) from public.shipments),
    'pending',     (select count(*) from public.shipments
                    where status in ('created', 'payment_pending', 'tracking_ready', 'pickup_requested')),
    'in_transit',  (select count(*) from public.shipments
                    where status in ('picked_up', 'in_transit', 'distribution_center', 'out_for_delivery')),
    'delivered',   (select count(*) from public.shipments where status = 'delivered'),
    'payments_paid', (select count(*) from public.payments where status = 'paid')
  );
end;
$$;

-- ════════════════════════════════════════════════════════════════════
-- Function privileges
-- Supabase grants EXECUTE on new functions to anon/authenticated by default.
-- Revoke everything, then grant only what each role needs.
-- ════════════════════════════════════════════════════════════════════
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.get_tracking(text) to anon, authenticated;
grant execute on function public.request_tracking_code(uuid) to authenticated;
grant execute on function public.admin_add_shipment_event(uuid, public.shipment_status, text, text) to authenticated;
grant execute on function public.admin_dashboard_stats() to authenticated;

grant execute on function public.confirm_tracking_payment(uuid, text, text, numeric, text) to service_role;
grant execute on function public.mark_payment_failed(uuid, text, text) to service_role;
