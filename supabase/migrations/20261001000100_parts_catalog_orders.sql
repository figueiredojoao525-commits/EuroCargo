-- ════════════════════════════════════════════════════════════════════
-- EuroCargo — auto parts catalogue, suppliers, pricing, customers, orders,
-- AI assistant logs, and tracking improvements.
--
-- Incremental and non-destructive: the initial schema is kept; existing
-- functions are only replaced by compatible versions.
--
-- Security model (same principles as the initial migration)
--   * RLS on every new table.
--   * Public (anon) can read ACTIVE catalogue data only: products, images,
--     compatibility, brands, categories and vehicles. Never costs, suppliers,
--     margins or price history.
--   * Customers read their own customer record, addresses and orders.
--     They create part requests only through create_part_request(), which
--     takes prices from the database, never from the browser.
--   * Admins (profiles.role = 'admin') manage everything through the API;
--     RLS checks is_admin() on every write.
-- ════════════════════════════════════════════════════════════════════

create extension if not exists pg_trgm with schema extensions;

-- ─────────────── Helpers ───────────────

-- Lower-case, accent-free text for searching (immutable, no extension needed).
create or replace function public.normalize_search(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(translate(coalesce(p_value, ''),
    'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñß',
    'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNns'));
$$;

-- Part references compared without spaces, dots or dashes: "7701 208 174" = "7701208174".
create or replace function public.normalize_ref(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select upper(regexp_replace(coalesce(p_value, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

-- "João Silva Ferreira" → "João F." (public tracking shows no full names).
create or replace function public.display_name(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_name is null or btrim(p_name) = '' then null
    when array_length(regexp_split_to_array(btrim(p_name), '\s+'), 1) = 1 then split_part(btrim(p_name), ' ', 1)
    else split_part(btrim(p_name), ' ', 1) || ' ' ||
         upper(left((regexp_split_to_array(btrim(p_name), '\s+'))[array_length(regexp_split_to_array(btrim(p_name), '\s+'), 1)], 1)) || '.'
  end;
$$;

-- ─────────────── Enums ───────────────
create type public.part_condition as enum ('new', 'used');
create type public.product_availability as enum ('in_stock', 'on_order', 'on_request', 'out_of_stock');
create type public.order_status as enum (
  'draft', 'submitted', 'quoted', 'confirmed', 'awaiting_payment', 'paid',
  'preparing', 'shipped', 'delivered', 'cancelled'
);
create type public.order_channel as enum ('website', 'whatsapp', 'phone', 'in_person', 'email', 'other');
create type public.price_rule_scope as enum ('product', 'supplier', 'category', 'condition', 'price_band', 'global');

-- ─────────────── Catalogue ───────────────
create table public.brands (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  country     text check (country ~ '^[A-Z]{2}$'),
  website     text check (website ~ '^https?://'),
  is_demo     boolean not null default false,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.vehicle_makes (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (char_length(name) between 1 and 60),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.vehicle_models (
  id          uuid primary key default gen_random_uuid(),
  make_id     uuid not null references public.vehicle_makes (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  slug        text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  body_type   text check (char_length(body_type) <= 40),
  year_from   smallint check (year_from between 1900 and 2100),
  year_to     smallint check (year_to between 1900 and 2100),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (make_id, slug),
  check (year_to is null or year_from is null or year_to >= year_from)
);
create index vehicle_models_make_idx on public.vehicle_models (make_id);

create table public.vehicle_variants (
  id           uuid primary key default gen_random_uuid(),
  model_id     uuid not null references public.vehicle_models (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 120),
  engine_code  text check (char_length(engine_code) <= 40),
  fuel         text check (fuel in ('petrol', 'diesel', 'hybrid', 'electric', 'lpg', 'other')),
  power_kw     smallint check (power_kw between 1 and 2000),
  engine_cc    smallint check (engine_cc between 1 and 20000),
  year_from    smallint check (year_from between 1900 and 2100),
  year_to      smallint check (year_to between 1900 and 2100),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (year_to is null or year_from is null or year_to >= year_from)
);
create index vehicle_variants_model_idx on public.vehicle_variants (model_id);

create table public.part_categories (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references public.part_categories (id) on delete set null,
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text not null check (char_length(name) between 1 and 80),
  -- Translations keyed by language code: {"es": "...", "en": "..."}; `name` is the fallback.
  name_i18n   jsonb not null default '{}'::jsonb check (jsonb_typeof(name_i18n) = 'object'),
  icon        text check (char_length(icon) <= 40),
  position    integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index part_categories_parent_idx on public.part_categories (parent_id);

create table public.products (
  id                 uuid primary key default gen_random_uuid(),
  sku                text unique check (char_length(sku) between 1 and 60),
  name               text not null check (char_length(name) between 2 and 200),
  name_i18n          jsonb not null default '{}'::jsonb check (jsonb_typeof(name_i18n) = 'object'),
  description        text check (char_length(description) <= 5000),
  brand_id           uuid references public.brands (id) on delete set null,
  category_id        uuid references public.part_categories (id) on delete set null,
  manufacturer       text check (char_length(manufacturer) <= 120),
  part_number        text check (char_length(part_number) <= 80),
  oe_numbers         text[] not null default '{}' check (cardinality(oe_numbers) <= 50),
  -- Products that are the same part in different conditions (new / used) share a group key.
  group_key          text check (char_length(group_key) <= 80),
  condition          public.part_condition not null default 'new',
  -- Public price. NULL means "price on request". Never derived in the browser.
  price              numeric(10, 2) check (price >= 0),
  currency           text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  price_mode         text not null default 'manual' check (price_mode in ('manual', 'rules')),
  availability       public.product_availability not null default 'on_request',
  stock_quantity     integer check (stock_quantity >= 0),
  lead_time_days     smallint check (lead_time_days between 0 and 365),
  specs              jsonb not null default '{}'::jsonb check (jsonb_typeof(specs) = 'object'),
  -- Where the data came from: 'manual', 'demo', 'supplier:<name>', 'tecdoc', ...
  data_source        text not null default 'manual' check (char_length(data_source) between 1 and 60),
  source_updated_at  timestamptz,
  is_demo            boolean not null default false,
  active             boolean not null default true,
  search_text        text not null default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index products_category_idx on public.products (category_id);
create index products_brand_idx on public.products (brand_id);
create index products_group_idx on public.products (group_key);
create index products_active_condition_idx on public.products (active, condition);
create index products_search_trgm_idx on public.products using gin (search_text extensions.gin_trgm_ops);

create table public.product_images (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete cascade,
  url         text not null check (url ~ '^https://'),
  alt         text check (char_length(alt) <= 200),
  position    integer not null default 0,
  -- Licence / credit of the image (images must be owned or licensed).
  source      text check (char_length(source) <= 200),
  created_at  timestamptz not null default now()
);
create index product_images_product_idx on public.product_images (product_id, position);

create table public.product_vehicle_compatibility (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete cascade,
  make_id     uuid not null references public.vehicle_makes (id) on delete cascade,
  model_id    uuid references public.vehicle_models (id) on delete cascade,
  variant_id  uuid references public.vehicle_variants (id) on delete cascade,
  year_from   smallint check (year_from between 1900 and 2100),
  year_to     smallint check (year_to between 1900 and 2100),
  -- Fitting position, e.g. "Front left".
  position    text check (char_length(position) <= 80),
  notes       text check (char_length(notes) <= 500),
  source      text not null default 'manual' check (char_length(source) between 1 and 60),
  verified    boolean not null default false,
  created_at  timestamptz not null default now(),
  check (year_to is null or year_from is null or year_to >= year_from)
);
create index pvc_product_idx on public.product_vehicle_compatibility (product_id);
create index pvc_vehicle_idx on public.product_vehicle_compatibility (make_id, model_id);

-- ─────────────── Suppliers & pricing (admin only) ───────────────
create table public.suppliers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  email       text check (char_length(email) <= 200),
  phone       text check (char_length(phone) <= 30),
  country     text check (country ~ '^[A-Z]{2}$'),
  website     text check (website ~ '^https?://'),
  notes       text check (char_length(notes) <= 2000),
  is_demo     boolean not null default false,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.supplier_products (
  id              uuid primary key default gen_random_uuid(),
  supplier_id     uuid not null references public.suppliers (id) on delete cascade,
  product_id      uuid not null references public.products (id) on delete cascade,
  supplier_sku    text check (char_length(supplier_sku) <= 80),
  cost_price      numeric(10, 2) check (cost_price >= 0),
  currency        text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  stock_quantity  integer check (stock_quantity >= 0),
  lead_time_days  smallint check (lead_time_days between 0 and 365),
  condition       public.part_condition,
  availability    public.product_availability not null default 'on_request',
  images          jsonb not null default '[]'::jsonb check (jsonb_typeof(images) = 'array'),
  active          boolean not null default true,
  last_synced_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (supplier_id, product_id)
);
create index supplier_products_product_idx on public.supplier_products (product_id);

create table public.price_rules (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (char_length(name) between 1 and 120),
  scope           public.price_rule_scope not null,
  product_id      uuid references public.products (id) on delete cascade,
  supplier_id     uuid references public.suppliers (id) on delete cascade,
  category_id     uuid references public.part_categories (id) on delete cascade,
  condition       public.part_condition,
  min_cost        numeric(10, 2) check (min_cost >= 0),
  max_cost        numeric(10, 2) check (max_cost >= 0),
  margin_percent  numeric(6, 2) not null default 0 check (margin_percent between -90 and 1000),
  fixed_amount    numeric(10, 2) not null default 0,
  priority        integer not null default 0,
  is_demo         boolean not null default false,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Each scope needs exactly its own target.
  check ((scope = 'product') = (product_id is not null)),
  check ((scope = 'supplier') = (supplier_id is not null)),
  check ((scope = 'category') = (category_id is not null)),
  check ((scope = 'condition') = (condition is not null)),
  check (scope = 'price_band' or (min_cost is null and max_cost is null)),
  check (scope <> 'price_band' or min_cost is not null or max_cost is not null),
  check (max_cost is null or min_cost is null or max_cost > min_cost)
);

create table public.product_price_history (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products (id) on delete cascade,
  old_price    numeric(10, 2),
  new_price    numeric(10, 2),
  cost_price   numeric(10, 2),
  supplier_id  uuid references public.suppliers (id) on delete set null,
  rule_id      uuid references public.price_rules (id) on delete set null,
  reason       text not null default 'manual' check (char_length(reason) <= 60),
  changed_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index product_price_history_product_idx on public.product_price_history (product_id, created_at desc);

-- ─────────────── Customers & orders ───────────────
-- A customer may have an account (user_id) or be created by an admin for a
-- phone / WhatsApp / in-person request (user_id NULL).
create table public.customers (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid unique references auth.users (id) on delete set null,
  full_name   text not null check (char_length(full_name) between 1 and 120),
  email       text check (char_length(email) <= 200),
  phone       text check (char_length(phone) <= 30),
  country     text check (country ~ '^[A-Z]{2}$'),
  tax_id      text check (char_length(tax_id) <= 30),
  source      public.order_channel not null default 'website',
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index customers_name_idx on public.customers using gin (full_name extensions.gin_trgm_ops);

create table public.customer_addresses (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references public.customers (id) on delete cascade,
  label           text check (char_length(label) <= 60),
  recipient_name  text not null check (char_length(recipient_name) between 2 and 120),
  phone           text check (char_length(phone) <= 30),
  line1           text not null check (char_length(line1) between 3 and 250),
  line2           text check (char_length(line2) <= 250),
  postal_code     text check (char_length(postal_code) <= 20),
  city            text not null check (char_length(city) between 2 and 100),
  region          text check (char_length(region) <= 100),
  country         text not null check (country ~ '^[A-Z]{2}$'),
  is_default      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index customer_addresses_customer_idx on public.customer_addresses (customer_id);

create table public.orders (
  id                uuid primary key default gen_random_uuid(),
  order_number      text not null unique check (order_number ~ '^ECO-[0-9]{4}-[A-Z0-9]{6}$'),
  customer_id       uuid not null references public.customers (id) on delete restrict,
  -- Owner account (copied from the customer by a trigger); used by RLS.
  user_id           uuid references auth.users (id) on delete set null,
  channel           public.order_channel not null default 'website',
  status            public.order_status not null default 'submitted',
  currency          text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  subtotal          numeric(10, 2) not null default 0,
  shipping_amount   numeric(10, 2) not null default 0 check (shipping_amount >= 0),
  total             numeric(10, 2) generated always as (subtotal + shipping_amount) stored,
  customer_message  text check (char_length(customer_message) <= 2000),
  vehicle_info      text check (char_length(vehicle_info) <= 300),
  shipping_address  jsonb check (shipping_address is null or jsonb_typeof(shipping_address) = 'object'),
  shipment_id       uuid unique references public.shipments (id) on delete set null,
  created_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index orders_customer_idx on public.orders (customer_id);
create index orders_user_idx on public.orders (user_id);
create index orders_status_idx on public.orders (status);
create index orders_created_at_idx on public.orders (created_at desc);

create table public.order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders (id) on delete cascade,
  product_id   uuid references public.products (id) on delete set null,
  -- Snapshot at order time, so later catalogue edits do not change the order.
  description  text not null check (char_length(description) between 1 and 300),
  part_number  text check (char_length(part_number) <= 80),
  condition    public.part_condition,
  quantity     integer not null default 1 check (quantity between 1 and 999),
  -- NULL = still to be quoted.
  unit_price   numeric(10, 2) check (unit_price >= 0),
  line_total   numeric(10, 2) generated always as (coalesce(unit_price, 0) * quantity) stored,
  created_at   timestamptz not null default now()
);
create index order_items_order_idx on public.order_items (order_id);

-- Order status history. `note` is shown to the customer when visible_to_customer.
create table public.order_events (
  id                   uuid primary key default gen_random_uuid(),
  order_id             uuid not null references public.orders (id) on delete cascade,
  status               public.order_status not null,
  note                 text check (char_length(note) <= 1000),
  visible_to_customer  boolean not null default true,
  created_by           uuid references auth.users (id) on delete set null,
  created_at           timestamptz not null default now()
);
create index order_events_order_idx on public.order_events (order_id, created_at desc);

-- Internal notes (never visible to customers).
create table public.order_notes (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders (id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 2000),
  author_id   uuid references auth.users (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);
create index order_notes_order_idx on public.order_notes (order_id, created_at desc);

-- ─────────────── AI assistant ───────────────
create table public.ai_conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users (id) on delete cascade,
  provider    text not null default 'local' check (char_length(provider) <= 40),
  created_at  timestamptz not null default now()
);
create index ai_conversations_user_idx on public.ai_conversations (user_id);

create table public.ai_messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.ai_conversations (id) on delete cascade,
  role             text not null check (role in ('user', 'assistant')),
  content          text not null check (char_length(content) <= 4000),
  product_ids      uuid[] not null default '{}' check (cardinality(product_ids) <= 20),
  created_at       timestamptz not null default now()
);
create index ai_messages_conversation_idx on public.ai_messages (conversation_id, created_at);

create table public.ai_search_logs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users (id) on delete set null,
  conversation_id  uuid references public.ai_conversations (id) on delete set null,
  query            text not null check (char_length(query) <= 500),
  parsed           jsonb not null default '{}'::jsonb,
  results_count    integer not null default 0,
  matched          boolean not null default false,
  provider         text not null default 'local' check (char_length(provider) <= 40),
  created_at       timestamptz not null default now()
);
create index ai_search_logs_created_idx on public.ai_search_logs (created_at desc);

-- updated_at maintenance
do $$
declare t text;
begin
  foreach t in array array['brands', 'vehicle_makes', 'vehicle_models', 'vehicle_variants', 'part_categories',
    'products', 'suppliers', 'supplier_products', 'price_rules', 'customers', 'customer_addresses', 'orders']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
                   t || '_set_updated_at', t);
  end loop;
end;
$$;

-- ════════════════════════════════════════════════════════════════════
-- Changes to existing tables (additive)
-- ════════════════════════════════════════════════════════════════════

-- Audit log covers the new entities too.
alter table public.admin_actions add column entity_type text check (char_length(entity_type) <= 40);
alter table public.admin_actions add column entity_id uuid;
create index admin_actions_entity_idx on public.admin_actions (entity_type, entity_id);

-- Admins can issue a tracking code without the online €1 fee (orders taken by
-- phone / WhatsApp / in person). The code still requires either condition.
alter table public.shipments add column tracking_fee_waived boolean not null default false;
alter table public.shipments drop constraint shipments_tracking_code_requires_payment;
alter table public.shipments add constraint shipments_tracking_code_requires_payment
  check (tracking_code is null or tracking_fee_paid or tracking_fee_waived);

-- When the event happened (set by the admin); created_at stays the insertion time.
alter table public.shipment_events add column occurred_at timestamptz;
update public.shipment_events set occurred_at = created_at where occurred_at is null;
alter table public.shipment_events alter column occurred_at set default now();
alter table public.shipment_events alter column occurred_at set not null;

-- ════════════════════════════════════════════════════════════════════
-- Triggers
-- ════════════════════════════════════════════════════════════════════

-- Searchable text: name, references, OE numbers, brand, category and compatible vehicles.
create or replace function public.build_product_search_text(p public.products)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select public.normalize_search(concat_ws(' ',
    p.name,
    (select string_agg(value, ' ') from jsonb_each_text(p.name_i18n)),
    p.part_number, public.normalize_ref(p.part_number),
    array_to_string(p.oe_numbers, ' '),
    (select string_agg(public.normalize_ref(x), ' ') from unnest(p.oe_numbers) x),
    p.manufacturer, p.sku,
    (select b.name from public.brands b where b.id = p.brand_id),
    (select concat_ws(' ', c.name, (select string_agg(value, ' ') from jsonb_each_text(c.name_i18n)))
       from public.part_categories c where c.id = p.category_id),
    (select string_agg(concat_ws(' ', mk.name, md.name, vv.name, pc.position), ' ')
       from public.product_vehicle_compatibility pc
       join public.vehicle_makes mk on mk.id = pc.make_id
       left join public.vehicle_models md on md.id = pc.model_id
       left join public.vehicle_variants vv on vv.id = pc.variant_id
      where pc.product_id = p.id)
  ));
$$;

-- SECURITY DEFINER: calls build_product_search_text(), which API roles cannot execute.
create or replace function public.products_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.oe_numbers := array(select btrim(x) from unnest(new.oe_numbers) x where btrim(x) <> '');
  if new.group_key is null or btrim(new.group_key) = '' then
    new.group_key := nullif(public.normalize_ref(coalesce(new.oe_numbers[1], new.part_number)), '');
  else
    new.group_key := public.normalize_ref(new.group_key);
  end if;
  new.search_text := public.build_product_search_text(new);
  return new;
end;
$$;

create trigger products_before_write
  before insert or update on public.products
  for each row execute function public.products_before_write();

-- Keep search_text current when compatibility, brand or category names change.
create or replace function public.refresh_product_search()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'product_vehicle_compatibility' then
    update public.products set search_text = search_text
    where id in (coalesce(new.product_id, old.product_id), coalesce(old.product_id, new.product_id));
  elsif tg_table_name = 'brands' then
    update public.products set search_text = search_text where brand_id = new.id;
  elsif tg_table_name = 'part_categories' then
    update public.products set search_text = search_text where category_id = new.id;
  end if;
  return null;
end;
$$;

create trigger pvc_refresh_product_search
  after insert or update or delete on public.product_vehicle_compatibility
  for each row execute function public.refresh_product_search();
create trigger brands_refresh_product_search
  after update of name on public.brands
  for each row execute function public.refresh_product_search();
create trigger part_categories_refresh_product_search
  after update of name, name_i18n on public.part_categories
  for each row execute function public.refresh_product_search();

-- Every public price change is recorded (rule-based changes record their own row).
create or replace function public.products_price_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.price is distinct from old.price
     and coalesce(current_setting('eurocargo.skip_price_history', true), '') <> 'on' then
    insert into public.product_price_history (product_id, old_price, new_price, reason, changed_by)
    values (new.id, old.price, new.price, 'manual', auth.uid());
  end if;
  return null;
end;
$$;

create trigger products_price_history
  after update of price on public.products
  for each row execute function public.products_price_history();

-- Order number: ECO-<YYYY>-<6 random chars> (same alphabet as tracking codes).
create or replace function public.generate_order_number()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_bytes  bytea;
  v_code   text;
begin
  loop
    v_bytes := extensions.gen_random_bytes(6);
    v_code := 'ECO-' || to_char(now() at time zone 'UTC', 'YYYY') || '-';
    for i in 0..5 loop
      v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.orders where order_number = v_code);
  end loop;
  return v_code;
end;
$$;

create or replace function public.orders_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.order_number := public.generate_order_number();
    new.created_by := coalesce(new.created_by, auth.uid());
  elsif new.order_number is distinct from old.order_number then
    raise exception 'order_number_immutable';
  end if;
  -- The owner account always follows the customer record.
  select c.user_id into new.user_id from public.customers c where c.id = new.customer_id;
  return new;
end;
$$;

create trigger orders_before_write
  before insert or update on public.orders
  for each row execute function public.orders_before_write();

-- Status history + audit for every status change.
create or replace function public.orders_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.order_events (order_id, status, created_by)
    values (new.id, new.status, auth.uid());
    if public.is_admin() then
      insert into public.admin_actions (admin_user_id, action, entity_type, entity_id, details)
      values (auth.uid(),
              case when tg_op = 'INSERT' then 'order_created' else 'order_status_changed' end,
              'order', new.id,
              jsonb_build_object('order_number', new.order_number, 'channel', new.channel,
                                 'from', case when tg_op = 'UPDATE' then old.status end, 'to', new.status));
    end if;
  end if;
  return null;
end;
$$;

create trigger orders_after_write
  after insert or update of status on public.orders
  for each row execute function public.orders_after_write();

-- Order subtotal always equals the sum of its items.
create or replace function public.order_items_refresh_total()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_order uuid := coalesce(new.order_id, old.order_id);
begin
  update public.orders
  set subtotal = coalesce((select sum(line_total) from public.order_items where order_id = v_order), 0)
  where id = v_order;
  if tg_op = 'UPDATE' and old.order_id <> new.order_id then
    update public.orders
    set subtotal = coalesce((select sum(line_total) from public.order_items where order_id = old.order_id), 0)
    where id = old.order_id;
  end if;
  return null;
end;
$$;

create trigger order_items_refresh_total
  after insert or update or delete on public.order_items
  for each row execute function public.order_items_refresh_total();

-- Every account gets a customer record (kept in sync with the profile).
create or replace function public.profiles_sync_customer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_email text;
begin
  select email into v_email from auth.users where id = new.user_id;
  if tg_op = 'INSERT' then
    insert into public.customers (user_id, full_name, email, phone, country, source)
    values (new.user_id,
            left(coalesce(nullif(btrim(new.full_name), ''), nullif(split_part(v_email, '@', 1), ''), 'Cliente'), 120),
            v_email, new.phone, new.country, 'website')
    on conflict (user_id) do nothing;
  else
    update public.customers
    set full_name = left(coalesce(nullif(btrim(new.full_name), ''), full_name), 120),
        phone = coalesce(new.phone, phone),
        country = coalesce(new.country, country)
    where user_id = new.user_id;
  end if;
  return null;
end;
$$;

create trigger profiles_sync_customer
  after insert or update of full_name, phone, country on public.profiles
  for each row execute function public.profiles_sync_customer();

-- Existing accounts get their customer record now.
insert into public.customers (user_id, full_name, email, phone, country, source)
select p.user_id,
       left(coalesce(nullif(btrim(p.full_name), ''), nullif(split_part(u.email, '@', 1), ''), 'Cliente'), 120),
       u.email, p.phone, p.country, 'website'
from public.profiles p
join auth.users u on u.id = p.user_id
on conflict (user_id) do nothing;

-- ════════════════════════════════════════════════════════════════════
-- Functions
-- ════════════════════════════════════════════════════════════════════

-- Customer record for an account (created on demand for old accounts).
create or replace function public.ensure_customer_for_user(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  select id into v_id from public.customers where user_id = p_user_id;
  if v_id is null then
    insert into public.customers (user_id, full_name, email, phone, country, source)
    select u.id,
           left(coalesce(nullif(btrim(p.full_name), ''), nullif(split_part(u.email, '@', 1), ''), 'Cliente'), 120),
           u.email, p.phone, p.country, 'website'
    from auth.users u left join public.profiles p on p.user_id = u.id
    where u.id = p_user_id
    on conflict (user_id) do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from public.customers where user_id = p_user_id;
    end if;
  end if;
  return v_id;
end;
$$;

-- Only known address keys are kept, trimmed and length-limited.
create or replace function public.clean_address(p_address jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when p_address is null or jsonb_typeof(p_address) <> 'object' then null else
    jsonb_strip_nulls(jsonb_build_object(
      'name',        left(nullif(btrim(p_address ->> 'name'), ''), 120),
      'phone',       left(nullif(btrim(p_address ->> 'phone'), ''), 30),
      'line1',       left(nullif(btrim(p_address ->> 'line1'), ''), 250),
      'line2',       left(nullif(btrim(p_address ->> 'line2'), ''), 250),
      'postal_code', left(nullif(btrim(p_address ->> 'postal_code'), ''), 20),
      'city',        left(nullif(btrim(p_address ->> 'city'), ''), 100),
      'country',     case when upper(p_address ->> 'country') ~ '^[A-Z]{2}$' then upper(p_address ->> 'country') end
    ))
  end;
$$;

-- Public catalogue search (runs with the caller's rights: RLS applies).
-- Returns {total, terms, items[]}; each item carries matched_terms / ref_match so the
-- assistant can tell a confirmed match from a related result.
create or replace function public.search_products(
  p_query        text default null,
  p_make_id      uuid default null,
  p_model_id     uuid default null,
  p_year         integer default null,
  p_category_id  uuid default null,
  p_condition    public.part_condition default null,
  p_brand_id     uuid default null,
  p_reference    text default null,
  p_limit        integer default 24,
  p_offset       integer default 0
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_terms  text[];
  v_ref    text := public.normalize_ref(p_reference);
  v_limit  integer := least(greatest(coalesce(p_limit, 24), 1), 60);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
begin
  select coalesce(array_agg(distinct w), '{}') into v_terms
  from regexp_split_to_table(public.normalize_search(left(p_query, 300)), '[^a-z0-9]+') as w
  where length(w) >= 2
    and w <> all (array['de', 'da', 'do', 'das', 'dos', 'para', 'com', 'um', 'uma', 'the', 'for', 'and', 'with',
                        'del', 'la', 'el', 'los', 'las', 'le', 'les', 'des', 'du', 'pour', 'et', 'und', 'der',
                        'die', 'fur', 'mit', 'per', 'di', 'il', 'con', 'en', 'no', 'na', 'of']);
  if length(v_ref) < 3 then
    v_ref := '';
  end if;

  with base as (
    select p.*,
           (select count(*) from unnest(v_terms) t where p.search_text like '%' || t || '%')::integer as matched_terms,
           (v_ref <> '' and (public.normalize_ref(p.part_number) = v_ref
                             or v_ref = any (select public.normalize_ref(x) from unnest(p.oe_numbers) x))) as ref_match
    from public.products p
    where p.active
      and (p_category_id is null or p.category_id = p_category_id
           or p.category_id in (select c.id from public.part_categories c where c.parent_id = p_category_id))
      and (p_condition is null or p.condition = p_condition)
      and (p_brand_id is null or p.brand_id = p_brand_id)
      and (p_make_id is null or exists (
            select 1 from public.product_vehicle_compatibility c
            where c.product_id = p.id and c.make_id = p_make_id
              and (p_model_id is null or c.model_id is null or c.model_id = p_model_id)
              and (p_year is null or ((c.year_from is null or c.year_from <= p_year)
                                      and (c.year_to is null or c.year_to >= p_year)))))
  ),
  filtered as (
    select * from base
    where (cardinality(v_terms) = 0 and v_ref = '')
       or (cardinality(v_terms) > 0 and matched_terms > 0)
       or ref_match
  ),
  page as (
    select * from filtered
    order by ref_match desc, matched_terms desc, (price is null), price, name
    limit v_limit offset v_offset
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'terms', to_jsonb(v_terms),
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', pg.id,
      'name', pg.name,
      'name_i18n', pg.name_i18n,
      'part_number', pg.part_number,
      'oe_numbers', to_jsonb(pg.oe_numbers),
      'manufacturer', pg.manufacturer,
      'group_key', pg.group_key,
      'brand', (select b.name from public.brands b where b.id = pg.brand_id),
      'category', (select jsonb_build_object('id', c.id, 'slug', c.slug, 'name', c.name, 'name_i18n', c.name_i18n)
                   from public.part_categories c where c.id = pg.category_id),
      'condition', pg.condition,
      'price', pg.price,
      'currency', pg.currency,
      'availability', pg.availability,
      'stock_quantity', pg.stock_quantity,
      'lead_time_days', pg.lead_time_days,
      'is_demo', pg.is_demo,
      'data_source', pg.data_source,
      'updated_at', greatest(pg.updated_at, coalesce(pg.source_updated_at, pg.updated_at)),
      'image', (select i.url from public.product_images i where i.product_id = pg.id order by i.position, i.created_at limit 1),
      'compatibility', coalesce((
        select jsonb_agg(jsonb_build_object('make', mk.name, 'model', md.name, 'variant', vv.name,
                                            'year_from', pc.year_from, 'year_to', pc.year_to, 'position', pc.position))
        from (select * from public.product_vehicle_compatibility x where x.product_id = pg.id order by x.created_at limit 6) pc
        join public.vehicle_makes mk on mk.id = pc.make_id
        left join public.vehicle_models md on md.id = pc.model_id
        left join public.vehicle_variants vv on vv.id = pc.variant_id), '[]'::jsonb),
      'matched_terms', pg.matched_terms,
      'ref_match', pg.ref_match
    ) order by pg.ref_match desc, pg.matched_terms desc, (pg.price is null), pg.price, pg.name), '[]'::jsonb)
  ) into v_result
  from page pg;

  return v_result;
end;
$$;

-- Customer part request / order from the website. Prices come from the catalogue.
-- p_items: [{"product_id": "..."} | {"description": "..."}, "quantity": n]
create or replace function public.create_part_request(
  p_items    jsonb default '[]'::jsonb,
  p_message  text default null,
  p_vehicle  text default null,
  p_contact  jsonb default '{}'::jsonb,
  p_address  jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_items    jsonb := coalesce(p_items, '[]'::jsonb);
  v_customer uuid;
  v_order    uuid;
  v_number   text;
  v_item     jsonb;
  v_product  public.products;
  v_qty      integer;
  v_desc     text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) > 20 then
    raise exception 'invalid_items';
  end if;
  if jsonb_array_length(v_items) = 0 and nullif(btrim(p_message), '') is null then
    raise exception 'empty_request';
  end if;

  v_customer := public.ensure_customer_for_user(v_uid);
  if jsonb_typeof(p_contact) = 'object' then
    update public.customers
    set phone = coalesce(left(nullif(btrim(p_contact ->> 'phone'), ''), 30), phone)
    where id = v_customer;
  end if;

  insert into public.orders (customer_id, channel, status, customer_message, vehicle_info, shipping_address, created_by)
  values (v_customer, 'website', 'submitted', left(nullif(btrim(p_message), ''), 2000),
          left(nullif(btrim(p_vehicle), ''), 300), public.clean_address(p_address), v_uid)
  returning id, order_number into v_order, v_number;

  for v_item in select value from jsonb_array_elements(v_items) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'invalid_items';
    end if;
    v_qty := least(greatest(coalesce((v_item ->> 'quantity')::integer, 1), 1), 99);
    if nullif(v_item ->> 'product_id', '') is not null then
      select * into v_product from public.products where id = (v_item ->> 'product_id')::uuid and active;
      if not found then
        raise exception 'product_not_found';
      end if;
      insert into public.order_items (order_id, product_id, description, part_number, condition, quantity, unit_price)
      values (v_order, v_product.id, v_product.name, v_product.part_number, v_product.condition, v_qty, v_product.price);
    else
      v_desc := left(nullif(btrim(v_item ->> 'description'), ''), 300);
      if v_desc is null then
        raise exception 'invalid_items';
      end if;
      insert into public.order_items (order_id, description, quantity) values (v_order, v_desc, v_qty);
    end if;
  end loop;

  return jsonb_build_object('id', v_order, 'order_number', v_number);
end;
$$;

-- Assistant usage log. Anonymous visitors: search log only.
-- Signed-in users: also the conversation, so they (and admins) can review it.
create or replace function public.log_assistant_exchange(
  p_query            text,
  p_answer           text default null,
  p_product_ids      uuid[] default '{}',
  p_parsed           jsonb default '{}'::jsonb,
  p_matched          boolean default false,
  p_results_count    integer default 0,
  p_provider         text default 'local',
  p_conversation_id  uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_conv    uuid;
  v_parsed  jsonb := case when jsonb_typeof(p_parsed) = 'object' and length(p_parsed::text) <= 2000
                          then p_parsed else '{}'::jsonb end;
  v_ids     uuid[] := coalesce(p_product_ids[1:20], '{}');
begin
  if nullif(btrim(p_query), '') is null then
    raise exception 'empty_query';
  end if;

  if v_uid is not null then
    select id into v_conv from public.ai_conversations where id = p_conversation_id and user_id = v_uid;
    if v_conv is null then
      insert into public.ai_conversations (user_id, provider)
      values (v_uid, left(coalesce(p_provider, 'local'), 40))
      returning id into v_conv;
    end if;
    insert into public.ai_messages (conversation_id, role, content)
    values (v_conv, 'user', left(btrim(p_query), 4000));
    if nullif(btrim(p_answer), '') is not null then
      insert into public.ai_messages (conversation_id, role, content, product_ids)
      values (v_conv, 'assistant', left(btrim(p_answer), 4000), v_ids);
    end if;
  end if;

  insert into public.ai_search_logs (user_id, conversation_id, query, parsed, results_count, matched, provider)
  values (v_uid, v_conv, left(btrim(p_query), 500), v_parsed, greatest(coalesce(p_results_count, 0), 0),
          coalesce(p_matched, false), left(coalesce(p_provider, 'local'), 40));

  return v_conv;
end;
$$;

-- Same checks as before; a code issued by an admin (fee waived) also counts as done.
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
  if v_shipment.tracking_fee_paid or v_shipment.tracking_fee_waived then
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

-- Public tracking: adds the recipient's short name ("João F.") and the event time;
-- still no phones, e-mails, addresses, prices, suppliers or internal data.
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
    'recipient_display',   public.display_name(s.recipient_name),
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
          'occurred_at', e.occurred_at,
          'created_at',  e.created_at
        ) order by e.occurred_at desc, e.created_at desc
      ) filter (where e.id is not null),
      '[]'::jsonb
    )
  )
  from public.shipments s
  left join public.shipment_events e on e.shipment_id = s.id
  where s.tracking_code = upper(btrim(p_code))
    and (s.tracking_fee_paid or s.tracking_fee_waived)
  group by s.id;
$$;

-- Admin event: now also accepts when it happened (defaults to now).
drop function public.admin_add_shipment_event(uuid, public.shipment_status, text, text);
create function public.admin_add_shipment_event(
  p_shipment_id  uuid,
  p_status       public.shipment_status,
  p_location     text default null,
  p_description  text default null,
  p_occurred_at  timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid         uuid := auth.uid();
  v_old_status  public.shipment_status;
  v_location    text := nullif(btrim(p_location), '');
  v_description text := nullif(btrim(p_description), '');
  v_occurred_at timestamptz := coalesce(p_occurred_at, now());
  v_event_id    uuid;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select status into v_old_status from public.shipments where id = p_shipment_id for update;
  if not found then
    raise exception 'shipment_not_found';
  end if;

  if v_occurred_at > now() + interval '1 day' or v_occurred_at < now() - interval '1 year' then
    raise exception 'invalid_event_date';
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

  insert into public.shipment_events (shipment_id, status, location, description, created_by, occurred_at)
  values (p_shipment_id, p_status, v_location, v_description, v_uid, v_occurred_at)
  returning id into v_event_id;

  insert into public.admin_actions (admin_user_id, shipment_id, action, entity_type, entity_id, details)
  values (
    v_uid, p_shipment_id,
    case when p_status <> v_old_status then 'status_changed' else 'event_added' end,
    'shipment', p_shipment_id,
    jsonb_build_object('from', v_old_status, 'to', p_status, 'location', v_location,
                       'description', v_description, 'occurred_at', v_occurred_at, 'event_id', v_event_id)
  );

  return v_event_id;
end;
$$;

-- Admin: create a shipment for a customer (or without account) and, by default,
-- issue its tracking code straight away (fee waived: order taken by the admin).
create or replace function public.admin_create_shipment(
  p_shipment       jsonb,
  p_customer_id    uuid default null,
  p_order_id       uuid default null,
  p_generate_code  boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_user     uuid;
  v_country  text := upper(p_shipment ->> 'sender_country');
  v_id       uuid;
  v_code     text;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_customer_id is not null then
    select user_id into v_user from public.customers where id = p_customer_id;
    if not found then
      raise exception 'customer_not_found';
    end if;
  end if;
  if p_order_id is not null and not exists (select 1 from public.orders where id = p_order_id and shipment_id is null) then
    raise exception 'order_not_available';
  end if;

  if p_generate_code then
    v_code := public.generate_tracking_code(v_country);
  end if;

  insert into public.shipments (
    user_id, tracking_code, tracking_fee_waived,
    sender_name, sender_phone, sender_country, sender_city, sender_address,
    recipient_name, recipient_phone, recipient_country, recipient_city, recipient_address,
    package_description, package_weight, notes)
  values (
    v_user, v_code, coalesce(p_generate_code, false),
    btrim(p_shipment ->> 'sender_name'), btrim(p_shipment ->> 'sender_phone'), v_country,
    btrim(p_shipment ->> 'sender_city'), btrim(p_shipment ->> 'sender_address'),
    btrim(p_shipment ->> 'recipient_name'), btrim(p_shipment ->> 'recipient_phone'),
    upper(p_shipment ->> 'recipient_country'), btrim(p_shipment ->> 'recipient_city'),
    btrim(p_shipment ->> 'recipient_address'),
    btrim(p_shipment ->> 'package_description'), (p_shipment ->> 'package_weight')::numeric,
    nullif(btrim(p_shipment ->> 'notes'), ''))
  returning id into v_id;

  if p_order_id is not null then
    update public.orders set shipment_id = v_id where id = p_order_id;
  end if;

  insert into public.admin_actions (admin_user_id, shipment_id, action, entity_type, entity_id, details)
  values (v_uid, v_id, 'shipment_created', 'shipment', v_id,
          jsonb_build_object('customer_id', p_customer_id, 'order_id', p_order_id, 'tracking_code', v_code));

  return jsonb_build_object('id', v_id, 'tracking_code', v_code);
end;
$$;

-- Admin: issue the tracking code of an existing shipment (idempotent).
create or replace function public.admin_generate_tracking_code(p_shipment_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shipment public.shipments;
  v_code     text;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_shipment from public.shipments where id = p_shipment_id for update;
  if not found then
    raise exception 'shipment_not_found';
  end if;
  if v_shipment.tracking_code is not null then
    return v_shipment.tracking_code;
  end if;
  if v_shipment.status = 'cancelled' then
    raise exception 'shipment_cancelled';
  end if;

  v_code := public.generate_tracking_code(v_shipment.sender_country);
  update public.shipments
  set tracking_code = v_code,
      tracking_fee_waived = not tracking_fee_paid
  where id = p_shipment_id;

  insert into public.admin_actions (admin_user_id, shipment_id, action, entity_type, entity_id, details)
  values (auth.uid(), p_shipment_id, 'tracking_code_issued', 'shipment', p_shipment_id,
          jsonb_build_object('tracking_code', v_code));
  return v_code;
end;
$$;

-- Admin: public price from the cheapest active supplier cost and the most specific rule
-- (product > supplier > category > condition > price band > global, then priority).
-- p_apply = false only previews. The result (incl. cost) is returned to admins only.
create or replace function public.admin_recalculate_price(p_product_id uuid, p_apply boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
  v_cost    numeric;
  v_curr    text;
  v_supp    uuid;
  v_rule    public.price_rules;
  v_price   numeric;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    raise exception 'product_not_found';
  end if;

  select sp.cost_price, sp.currency, sp.supplier_id into v_cost, v_curr, v_supp
  from public.supplier_products sp
  join public.suppliers s on s.id = sp.supplier_id and s.active
  where sp.product_id = p_product_id and sp.active and sp.cost_price is not null
  order by (sp.availability = 'in_stock') desc, sp.cost_price
  limit 1;
  if v_cost is null then
    raise exception 'no_supplier_cost';
  end if;

  select r.* into v_rule
  from public.price_rules r
  where r.active and (
       (r.scope = 'product' and r.product_id = v_product.id)
    or (r.scope = 'supplier' and r.supplier_id = v_supp)
    or (r.scope = 'category' and r.category_id = v_product.category_id)
    or (r.scope = 'condition' and r.condition = v_product.condition)
    or (r.scope = 'price_band' and (r.min_cost is null or v_cost >= r.min_cost) and (r.max_cost is null or v_cost < r.max_cost))
    or r.scope = 'global')
  order by case r.scope when 'product' then 1 when 'supplier' then 2 when 'category' then 3
                        when 'condition' then 4 when 'price_band' then 5 else 6 end,
           r.priority desc, r.created_at
  limit 1;
  if v_rule.id is null then
    raise exception 'no_price_rule';
  end if;

  v_price := greatest(round(v_cost * (1 + v_rule.margin_percent / 100) + v_rule.fixed_amount, 2), 0);

  if p_apply then
    perform set_config('eurocargo.skip_price_history', 'on', true);
    update public.products set price = v_price, currency = v_curr, price_mode = 'rules' where id = p_product_id;
    perform set_config('eurocargo.skip_price_history', 'off', true);
    if v_price is distinct from v_product.price then
      insert into public.product_price_history (product_id, old_price, new_price, cost_price, supplier_id, rule_id, reason, changed_by)
      values (p_product_id, v_product.price, v_price, v_cost, v_supp, v_rule.id, 'rule', auth.uid());
    end if;
  end if;

  return jsonb_build_object('product_id', p_product_id, 'cost', v_cost, 'currency', v_curr, 'supplier_id', v_supp,
                            'rule_id', v_rule.id, 'rule_name', v_rule.name, 'margin_percent', v_rule.margin_percent,
                            'fixed_amount', v_rule.fixed_amount, 'old_price', v_product.price, 'price', v_price,
                            'applied', p_apply);
end;
$$;

-- Admin: re-apply pricing rules to every product priced by rules.
create or replace function public.admin_recalculate_all_prices()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id      uuid;
  v_updated integer := 0;
  v_skipped integer := 0;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  for v_id in select id from public.products where price_mode = 'rules' loop
    begin
      perform public.admin_recalculate_price(v_id, true);
      v_updated := v_updated + 1;
    exception when others then
      v_skipped := v_skipped + 1;
    end;
  end loop;
  return jsonb_build_object('updated', v_updated, 'skipped', v_skipped);
end;
$$;

-- Admin dashboard counters (extended with the shop).
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
                    where status in ('created', 'payment_pending', 'tracking_ready', 'payment_confirmed', 'prepared', 'pickup_requested')),
    'in_transit',  (select count(*) from public.shipments
                    where status in ('picked_up', 'departed_facility', 'in_transit', 'distribution_center', 'out_for_delivery', 'near_delivery')),
    'delivered',   (select count(*) from public.shipments where status = 'delivered'),
    'payments_paid', (select count(*) from public.payments where status = 'paid'),
    'orders_open', (select count(*) from public.orders where status not in ('delivered', 'cancelled')),
    'orders_new',  (select count(*) from public.orders where status = 'submitted'),
    'products_active', (select count(*) from public.products where active),
    'customers',   (select count(*) from public.customers)
  );
end;
$$;

-- Admin: remove every demo record (products, their images/compatibility/supplier
-- links/history, demo suppliers, rules and brands). Real data is never touched.
create or replace function public.admin_purge_demo_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_products integer;
  v_suppliers integer;
  v_rules integer;
  v_brands integer;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.price_rules where is_demo;
  get diagnostics v_rules = row_count;
  delete from public.products where is_demo;
  get diagnostics v_products = row_count;
  delete from public.suppliers where is_demo;
  get diagnostics v_suppliers = row_count;
  delete from public.brands b where b.is_demo and not exists (select 1 from public.products p where p.brand_id = b.id);
  get diagnostics v_brands = row_count;
  insert into public.admin_actions (admin_user_id, action, entity_type, details)
  values (auth.uid(), 'demo_data_purged', 'catalog',
          jsonb_build_object('products', v_products, 'suppliers', v_suppliers, 'rules', v_rules, 'brands', v_brands));
  return jsonb_build_object('products', v_products, 'suppliers', v_suppliers, 'rules', v_rules, 'brands', v_brands);
end;
$$;

-- ════════════════════════════════════════════════════════════════════
-- Row Level Security
-- ════════════════════════════════════════════════════════════════════
alter table public.brands                        enable row level security;
alter table public.vehicle_makes                 enable row level security;
alter table public.vehicle_models                enable row level security;
alter table public.vehicle_variants              enable row level security;
alter table public.part_categories               enable row level security;
alter table public.products                      enable row level security;
alter table public.product_images                enable row level security;
alter table public.product_vehicle_compatibility enable row level security;
alter table public.suppliers                     enable row level security;
alter table public.supplier_products             enable row level security;
alter table public.price_rules                   enable row level security;
alter table public.product_price_history         enable row level security;
alter table public.customers                     enable row level security;
alter table public.customer_addresses            enable row level security;
alter table public.orders                        enable row level security;
alter table public.order_items                   enable row level security;
alter table public.order_events                  enable row level security;
alter table public.order_notes                   enable row level security;
alter table public.ai_conversations              enable row level security;
alter table public.ai_messages                   enable row level security;
alter table public.ai_search_logs                enable row level security;

-- Admins manage every new table. (Separate from the read policies below;
-- permissive policies are OR-ed.)
do $$
declare t text;
begin
  foreach t in array array['brands', 'vehicle_makes', 'vehicle_models', 'vehicle_variants', 'part_categories',
    'products', 'product_images', 'product_vehicle_compatibility', 'suppliers', 'supplier_products',
    'price_rules', 'product_price_history', 'customers', 'customer_addresses', 'orders', 'order_items',
    'order_events', 'order_notes', 'ai_conversations', 'ai_messages', 'ai_search_logs']
  loop
    execute format('create policy %I on public.%I for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))',
                   t || ': admin all', t);
  end loop;
end;
$$;

-- Public catalogue (visitors see active records only).
create policy "brands: public read" on public.brands for select to anon, authenticated using (active);
create policy "vehicle_makes: public read" on public.vehicle_makes for select to anon, authenticated using (active);
create policy "vehicle_models: public read" on public.vehicle_models for select to anon, authenticated using (active);
create policy "vehicle_variants: public read" on public.vehicle_variants for select to anon, authenticated using (true);
create policy "part_categories: public read" on public.part_categories for select to anon, authenticated using (active);
create policy "products: public read" on public.products for select to anon, authenticated using (active);
create policy "product_images: public read" on public.product_images for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.active));
create policy "pvc: public read" on public.product_vehicle_compatibility for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.active));

-- Customers: own records only.
create policy "customers: read own" on public.customers for select to authenticated
  using (user_id = (select auth.uid()));

create policy "customer_addresses: own" on public.customer_addresses for all to authenticated
  using (exists (select 1 from public.customers c where c.id = customer_id and c.user_id = (select auth.uid())))
  with check (exists (select 1 from public.customers c where c.id = customer_id and c.user_id = (select auth.uid())));

create policy "orders: read own" on public.orders for select to authenticated
  using (user_id = (select auth.uid()));

create policy "order_items: read own" on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid())));

create policy "order_events: read own" on public.order_events for select to authenticated
  using (visible_to_customer and exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid())));

create policy "ai_conversations: read own" on public.ai_conversations for select to authenticated
  using (user_id = (select auth.uid()));

create policy "ai_messages: read own" on public.ai_messages for select to authenticated
  using (exists (select 1 from public.ai_conversations c where c.id = conversation_id and c.user_id = (select auth.uid())));

-- ════════════════════════════════════════════════════════════════════
-- Table privileges (Supabase grants ALL by default; restrict, then grant)
-- ════════════════════════════════════════════════════════════════════
revoke all on public.brands, public.vehicle_makes, public.vehicle_models, public.vehicle_variants,
              public.part_categories, public.products, public.product_images,
              public.product_vehicle_compatibility, public.suppliers, public.supplier_products,
              public.price_rules, public.product_price_history, public.customers,
              public.customer_addresses, public.orders, public.order_items, public.order_events,
              public.order_notes, public.ai_conversations, public.ai_messages, public.ai_search_logs
  from anon, authenticated;

-- Catalogue: readable by everyone (RLS: active rows only for non-admins).
grant select on public.brands, public.vehicle_makes, public.vehicle_models, public.vehicle_variants,
                public.part_categories, public.products, public.product_images,
                public.product_vehicle_compatibility
  to anon, authenticated;

-- Everything else: signed-in users, with RLS deciding rows (own data or admin).
grant select on public.suppliers, public.supplier_products, public.price_rules, public.product_price_history,
                public.customers, public.customer_addresses, public.orders, public.order_items,
                public.order_events, public.order_notes, public.ai_conversations, public.ai_messages,
                public.ai_search_logs
  to authenticated;

-- Writes: only admins pass the RLS policies, except customers' own addresses.
grant insert, update, delete on public.brands, public.vehicle_makes, public.vehicle_models,
                                public.vehicle_variants, public.part_categories, public.products,
                                public.product_images, public.product_vehicle_compatibility,
                                public.suppliers, public.supplier_products, public.price_rules,
                                public.customers, public.customer_addresses, public.orders,
                                public.order_items, public.order_events, public.order_notes
  to authenticated;

-- Edge Functions (future supplier sync / AI provider) run as service_role.
grant all on public.brands, public.vehicle_makes, public.vehicle_models, public.vehicle_variants,
             public.part_categories, public.products, public.product_images,
             public.product_vehicle_compatibility, public.suppliers, public.supplier_products,
             public.price_rules, public.product_price_history, public.customers,
             public.customer_addresses, public.orders, public.order_items, public.order_events,
             public.order_notes, public.ai_conversations, public.ai_messages, public.ai_search_logs
  to service_role;
grant select, update on public.payments to service_role;

-- ════════════════════════════════════════════════════════════════════
-- Function privileges (new functions only; existing grants are kept)
-- ════════════════════════════════════════════════════════════════════
revoke execute on function
  public.normalize_search(text), public.normalize_ref(text), public.display_name(text),
  public.build_product_search_text(public.products), public.products_before_write(),
  public.refresh_product_search(), public.products_price_history(), public.generate_order_number(),
  public.orders_before_write(), public.orders_after_write(), public.order_items_refresh_total(),
  public.profiles_sync_customer(), public.ensure_customer_for_user(uuid), public.clean_address(jsonb),
  public.search_products(text, uuid, uuid, integer, uuid, public.part_condition, uuid, text, integer, integer),
  public.create_part_request(jsonb, text, text, jsonb, jsonb),
  public.log_assistant_exchange(text, text, uuid[], jsonb, boolean, integer, text, uuid),
  public.request_tracking_code(uuid), public.get_tracking(text),
  public.admin_add_shipment_event(uuid, public.shipment_status, text, text, timestamptz),
  public.admin_create_shipment(jsonb, uuid, uuid, boolean), public.admin_generate_tracking_code(uuid),
  public.admin_recalculate_price(uuid, boolean), public.admin_recalculate_all_prices(),
  public.admin_dashboard_stats(), public.admin_purge_demo_data()
from public, anon, authenticated;

-- search_products runs as the caller, so the normalisers must be callable too.
grant execute on function public.normalize_search(text), public.normalize_ref(text) to anon, authenticated;
grant execute on function
  public.search_products(text, uuid, uuid, integer, uuid, public.part_condition, uuid, text, integer, integer),
  public.log_assistant_exchange(text, text, uuid[], jsonb, boolean, integer, text, uuid),
  public.get_tracking(text)
to anon, authenticated;
grant execute on function
  public.create_part_request(jsonb, text, text, jsonb, jsonb),
  public.request_tracking_code(uuid),
  public.admin_add_shipment_event(uuid, public.shipment_status, text, text, timestamptz),
  public.admin_create_shipment(jsonb, uuid, uuid, boolean),
  public.admin_generate_tracking_code(uuid),
  public.admin_recalculate_price(uuid, boolean),
  public.admin_recalculate_all_prices(),
  public.admin_dashboard_stats(),
  public.admin_purge_demo_data()
to authenticated;

-- ════════════════════════════════════════════════════════════════════
-- Storage: public bucket for product photos; only admins can upload/delete.
-- (Skipped where the Supabase storage schema does not exist, e.g. plain Postgres.)
-- ════════════════════════════════════════════════════════════════════
do $$
begin
  if to_regclass('storage.buckets') is not null and to_regclass('storage.objects') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('product-images', 'product-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;

    execute $p$create policy "product-images: admin read" on storage.objects for select to authenticated
      using (bucket_id = 'product-images' and (select public.is_admin()))$p$;
    execute $p$create policy "product-images: admin insert" on storage.objects for insert to authenticated
      with check (bucket_id = 'product-images' and (select public.is_admin()))$p$;
    execute $p$create policy "product-images: admin update" on storage.objects for update to authenticated
      using (bucket_id = 'product-images' and (select public.is_admin()))$p$;
    execute $p$create policy "product-images: admin delete" on storage.objects for delete to authenticated
      using (bucket_id = 'product-images' and (select public.is_admin()))$p$;
  end if;
end;
$$;
