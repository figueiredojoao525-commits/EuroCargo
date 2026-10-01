-- ════════════════════════════════════════════════════════════════════
-- EuroCargo — catalogue at scale: providers, bulk import, references,
-- richer vehicles and images, indexed search.
--
-- Incremental and non-destructive: no table, column, policy or demo row is
-- removed. Existing functions are replaced only by compatible versions
-- (same signature, same behaviour for existing callers):
--   * build_product_search_text  — also indexes cross references, EAN, engine data
--   * refresh_product_search     — can be paused during bulk imports
--   * admin_recalculate_price    — same checks/result; body moved to catalog_compute_price
-- search_products() is kept untouched (the website falls back to it).
--
-- Security model (unchanged principles)
--   * RLS on every new table.
--   * Public: product references (part number / OE / EAN / cross), search
--     synonyms, catalog_search() and catalog_public_config() — never costs,
--     suppliers, source configuration or original image URLs.
--   * Import functions: admins through admin_* wrappers; the bare catalog_*
--     functions only for service_role (Edge Functions catalog-sync / catalog-external).
--   * No credentials in the database: catalog_sources.config refuses
--     key/secret/token/password fields. API keys live in Supabase secrets.
-- ════════════════════════════════════════════════════════════════════

-- ─────────────── Helpers ───────────────

-- "Série 3 (E90)" → "serie-3-e90" (same rule as the website's slugify()).
create or replace function public.slugify(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select left(btrim(regexp_replace(public.normalize_search(p_value), '[^a-z0-9]+', '-', 'g'), '-'), 80);
$$;

-- Light Portuguese/Spanish stemming for search terms, so plural/gender forms match:
-- "pastilhas" → "pastilh", "dianteiro"/"dianteira" → "dianteir", "travões" → "trava".
-- Terms with digits (references, engine sizes) are returned unchanged.
create or replace function public.search_stem(p_term text)
returns text
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  v text := public.normalize_search(btrim(coalesce(p_term, '')));
begin
  if v ~ '[0-9]' or length(v) <= 4 then
    return v;
  end if;
  if v ~ 'oes$' then
    v := regexp_replace(v, 'oes$', 'ao');
  elsif v ~ '[rzl]es$' then
    v := left(v, -2);
  elsif v ~ 's$' then
    v := left(v, -1);
  end if;
  if length(v) > 5 and v ~ '[oa]$' then
    v := left(v, -1);
  end if;
  return v;
end;
$$;

-- ─────────────── Vehicles: make → model → generation → variant (engine) ───────────────
alter table public.vehicle_makes
  add column external_id text check (char_length(external_id) <= 120),
  add column data_source text not null default 'manual' check (char_length(data_source) between 1 and 60);
create unique index vehicle_makes_source_external_idx
  on public.vehicle_makes (data_source, external_id) where external_id is not null;

alter table public.vehicle_models
  -- Generation / series as sold, e.g. "Mk5", "3H", "B6".
  add column generation text check (char_length(generation) <= 80),
  add column external_id text check (char_length(external_id) <= 120),
  add column data_source text not null default 'manual' check (char_length(data_source) between 1 and 60);
create unique index vehicle_models_source_external_idx
  on public.vehicle_models (data_source, external_id) where external_id is not null;
create index vehicle_models_make_name_idx on public.vehicle_models (make_id, public.normalize_search(name));

alter table public.vehicle_variants
  add column power_hp smallint check (power_hp between 1 and 2700),
  add column body_type text check (char_length(body_type) <= 40),
  add column external_id text check (char_length(external_id) <= 120),
  add column data_source text not null default 'manual' check (char_length(data_source) between 1 and 60);
create unique index vehicle_variants_source_external_idx
  on public.vehicle_variants (data_source, external_id) where external_id is not null;
create index vehicle_variants_model_name_idx on public.vehicle_variants (model_id, public.normalize_search(name));
create index vehicle_variants_engine_code_idx on public.vehicle_variants (upper(engine_code)) where engine_code is not null;

-- ─────────────── Products ───────────────
alter table public.products
  -- Identifier of the record at its source (supplier feed / licensed catalogue).
  add column external_id text check (char_length(external_id) <= 120),
  add column ean text check (ean ~ '^[0-9]{8,14}$'),
  -- When EuroCargo last imported / synchronised this record (source_updated_at = the source's own date).
  add column last_synced_at timestamptz;
create unique index products_source_external_idx on public.products (data_source, external_id) where external_id is not null;
create index products_brand_ref_idx on public.products (brand_id, public.normalize_ref(part_number)) where part_number is not null;
create index products_updated_idx on public.products (updated_at desc);
create index products_active_name_idx on public.products (name) where active;

-- Every reference a product can be found by. part_number / oe / ean rows are kept in
-- sync with the product columns by a trigger; 'cross' rows (equivalent references of
-- other manufacturers) come from imports or admins. Supplier SKUs are NOT here (internal).
create table public.product_references (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references public.products (id) on delete cascade,
  kind            text not null check (kind in ('part_number', 'oe', 'ean', 'cross')),
  reference       text not null check (char_length(reference) between 1 and 80),
  reference_norm  text not null check (char_length(reference_norm) between 1 and 80),
  -- Manufacturer the reference belongs to (OE: vehicle maker; cross: parts brand).
  brand           text check (char_length(brand) <= 80),
  source          text not null default 'manual' check (char_length(source) between 1 and 60),
  created_at      timestamptz not null default now(),
  unique (product_id, kind, reference_norm)
);
create index product_references_norm_idx on public.product_references (reference_norm);

create or replace function public.product_references_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.reference := btrim(new.reference);
  new.reference_norm := public.normalize_ref(new.reference);
  if new.reference_norm = '' then
    raise exception 'invalid_reference';
  end if;
  return new;
end;
$$;

create trigger product_references_before_write
  before insert or update on public.product_references
  for each row execute function public.product_references_before_write();

-- Keeps part_number / oe / ean reference rows equal to the product columns.
create or replace function public.products_sync_references()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.product_references
  where product_id = new.id and kind in ('part_number', 'oe', 'ean');

  insert into public.product_references (product_id, kind, reference, reference_norm, source)
  select new.id, x.kind, x.ref, public.normalize_ref(x.ref), new.data_source
  from (
    select 'part_number' as kind, new.part_number as ref
    union all select 'oe', o from unnest(new.oe_numbers) o
    union all select 'ean', new.ean
  ) x
  where x.ref is not null and public.normalize_ref(x.ref) <> '' and char_length(x.ref) <= 80
  on conflict (product_id, kind, reference_norm) do nothing;
  return null;
end;
$$;

create trigger products_sync_references
  after insert or update of part_number, oe_numbers, ean on public.products
  for each row execute function public.products_sync_references();

-- Existing products get their reference rows now.
insert into public.product_references (product_id, kind, reference, reference_norm, source)
select p.id, x.kind, x.ref, public.normalize_ref(x.ref), p.data_source
from public.products p
cross join lateral (
  select 'part_number' as kind, p.part_number as ref
  union all select 'oe', o from unnest(p.oe_numbers) o
) x
where x.ref is not null and public.normalize_ref(x.ref) <> '' and char_length(x.ref) <= 80
on conflict (product_id, kind, reference_norm) do nothing;

-- ─────────────── Images ───────────────
alter table public.product_images
  add column is_primary boolean not null default false,
  -- Licence / terms under which the image may be shown (e.g. "Licenciado por <fornecedor>").
  add column license text check (char_length(license) <= 200),
  add column data_source text not null default 'manual' check (char_length(data_source) between 1 and 60);
create unique index product_images_primary_idx on public.product_images (product_id) where is_primary;
create index product_images_product_url_idx on public.product_images (product_id, url);

-- ─────────────── Catalogue sources / providers (admin only) ───────────────
create table public.catalog_sources (
  id                 uuid primary key default gen_random_uuid(),
  -- Stored as products.data_source for imported records.
  key                text not null unique check (key ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(key) <= 40),
  name               text not null check (char_length(name) between 1 and 120),
  -- file: CSV/JSON/XML uploads; rest: an HTTP feed/API; tecdoc: TecAlliance web service.
  kind               text not null check (kind in ('file', 'rest', 'tecdoc', 'other')),
  -- import: data is copied into EuroCargo's tables; live: queried on demand by catalog-external.
  mode               text not null default 'import' check (mode in ('import', 'live', 'both')),
  enabled            boolean not null default false,
  priority           integer not null default 0,
  -- Server-side adapter name in supabase/functions/_shared/catalog/registry.ts (kind rest/tecdoc).
  adapter            text check (char_length(adapter) <= 40),
  capabilities       text[] not null default '{}'
                     check (capabilities <@ array['search', 'reference', 'oe', 'vehicle', 'vin', 'plate', 'images',
                                                  'compatibility', 'sync']::text[]),
  supplier_id        uuid references public.suppliers (id) on delete set null,
  default_condition  public.part_condition,
  default_currency   text check (default_currency ~ '^[A-Z]{3}$'),
  -- Licence text applied to images from this source when a row has none.
  image_license      text check (char_length(image_license) <= 200),
  -- Non-secret settings only (field mapping, paths, page size). Credentials go in Supabase secrets.
  config             jsonb not null default '{}'::jsonb
                     check (jsonb_typeof(config) = 'object'
                            and not (config ?| array['api_key', 'apikey', 'key', 'secret', 'token', 'password',
                                                     'authorization', 'client_secret'])),
  cache_ttl_minutes  integer not null default 1440 check (cache_ttl_minutes between 0 and 43200),
  sync_cursor        text check (char_length(sync_cursor) <= 500),
  last_sync_at       timestamptz,
  last_sync_status   text check (last_sync_status in ('ok', 'partial', 'failed')),
  last_sync_message  text check (char_length(last_sync_message) <= 1000),
  notes              text check (char_length(notes) <= 2000),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger catalog_sources_set_updated_at
  before update on public.catalog_sources
  for each row execute function public.set_updated_at();

-- Internal provenance of an image (original URL at the source). Admin only.
create table public.product_image_sources (
  image_id      uuid primary key references public.product_images (id) on delete cascade,
  original_url  text check (original_url ~ '^https?://' and char_length(original_url) <= 1000),
  -- Path in the product-images bucket when the file was stored by EuroCargo.
  storage_path  text check (char_length(storage_path) <= 300),
  source_id     uuid references public.catalog_sources (id) on delete set null,
  supplier_id   uuid references public.suppliers (id) on delete set null,
  fetched_at    timestamptz not null default now()
);

-- ─────────────── Suppliers: more internal fields per product ───────────────
alter table public.supplier_products
  -- Internal link to the item at the supplier (never shown to customers).
  add column source_url text check (source_url ~ '^https?://' and char_length(source_url) <= 500),
  add column external_id text check (char_length(external_id) <= 120),
  add column notes text check (char_length(notes) <= 1000);
create index supplier_products_supplier_sku_idx on public.supplier_products (supplier_id, supplier_sku);

-- ─────────────── Import batches (admin only) ───────────────
create table public.catalog_import_batches (
  id           uuid primary key default gen_random_uuid(),
  source_id    uuid references public.catalog_sources (id) on delete set null,
  data_source  text not null check (char_length(data_source) between 1 and 60),
  format       text not null check (format in ('csv', 'json', 'xml', 'api')),
  file_name    text check (char_length(file_name) <= 200),
  mode         text not null default 'upsert' check (mode in ('upsert', 'insert_only', 'update_only')),
  options      jsonb not null default '{}'::jsonb check (jsonb_typeof(options) = 'object'),
  status       text not null default 'running' check (status in ('running', 'completed', 'partial', 'failed', 'cancelled')),
  total_rows   integer not null default 0,
  inserted     integer not null default 0,
  updated      integer not null default 0,
  skipped      integer not null default 0,
  failed       integer not null default 0,
  -- First errors/warnings only: [{row, error}] (the full list is shown during the import).
  errors       jsonb not null default '[]'::jsonb check (jsonb_typeof(errors) = 'array'),
  created_by   uuid references auth.users (id) on delete set null default auth.uid(),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz
);
create index catalog_import_batches_started_idx on public.catalog_import_batches (started_at desc);
create index catalog_import_batches_source_idx on public.catalog_import_batches (source_id, started_at desc);

-- Live provider cache: which queries were already fetched (results live in the catalogue tables).
create table public.catalog_live_queries (
  source_id   uuid not null references public.catalog_sources (id) on delete cascade,
  query_key   text not null check (char_length(query_key) <= 300),
  results     integer not null default 0,
  fetched_at  timestamptz not null default now(),
  primary key (source_id, query_key)
);

-- ─────────────── Search synonyms (public read, admin managed) ───────────────
create table public.search_synonyms (
  id          uuid primary key default gen_random_uuid(),
  term        text not null unique check (term ~ '^[a-z0-9]+$' and char_length(term) <= 40),
  synonyms    text[] not null check (cardinality(synonyms) between 1 and 20),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Vocabulary only (no product data): common names of the same part in PT / ES / EN / FR / DE / IT.
insert into public.search_synonyms (term, synonyms) values
  ('farol',       array['otica', 'optica', 'faro', 'headlight', 'phare', 'scheinwerfer']),
  ('otica',       array['farol', 'optica', 'faro', 'headlight']),
  ('faro',        array['farol', 'otica', 'optica']),
  ('farolim',     array['piloto', 'taillight', 'farolin']),
  ('pastilha',    array['pastilla', 'brake pad', 'plaquette', 'pastiglia']),
  ('pastilla',    array['pastilha', 'pastiglia']),
  ('amortecedor', array['amortiguador', 'shock absorber', 'amortisseur', 'ammortizzatore', 'stossdampfer']),
  ('amortiguador',array['amortecedor', 'ammortizzatore']),
  ('travao',      array['travagem', 'freno', 'brake', 'frein', 'bremse']),
  ('freno',       array['travao', 'travagem', 'brake']),
  ('esquerdo',    array['esquerda', 'izquierdo', 'izquierda', 'left', 'gauche', 'links', 'sinistro']),
  ('izquierdo',   array['esquerdo', 'esquerda']),
  ('direito',     array['direita', 'derecho', 'derecha', 'right', 'droit', 'rechts', 'destro']),
  ('derecho',     array['direito', 'direita']),
  ('dianteiro',   array['dianteira', 'frente', 'delantero', 'delantera', 'front', 'avant', 'vorne', 'anteriore']),
  ('delantero',   array['dianteiro', 'dianteira']),
  ('traseiro',    array['traseira', 'trasero', 'trasera', 'rear', 'arriere', 'hinten', 'posteriore']),
  ('trasero',     array['traseiro', 'traseira']),
  ('retrovisor',  array['espelho', 'espejo', 'mirror', 'retroviseur', 'spiegel', 'specchio']),
  ('embraiagem',  array['embrague', 'clutch', 'embrayage', 'kupplung', 'frizione']),
  ('embrague',    array['embraiagem']),
  ('radiador',    array['radiator', 'radiateur', 'kuhler', 'radiatore'])
on conflict (term) do nothing;

-- ════════════════════════════════════════════════════════════════════
-- Search text: also cross references, EAN, generation and engine data
-- ════════════════════════════════════════════════════════════════════
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
    p.ean,
    p.manufacturer, p.sku,
    (select b.name from public.brands b where b.id = p.brand_id),
    (select concat_ws(' ', c.name, (select string_agg(value, ' ') from jsonb_each_text(c.name_i18n)))
       from public.part_categories c where c.id = p.category_id),
    (select string_agg(concat_ws(' ', r.reference, r.reference_norm, r.brand), ' ')
       from public.product_references r where r.product_id = p.id and r.kind = 'cross'),
    (select string_agg(concat_ws(' ', mk.name, md.name, md.generation, vv.name, vv.engine_code, pc.position), ' ')
       from public.product_vehicle_compatibility pc
       join public.vehicle_makes mk on mk.id = pc.make_id
       left join public.vehicle_models md on md.id = pc.model_id
       left join public.vehicle_variants vv on vv.id = pc.variant_id
      where pc.product_id = p.id)
  ));
$$;

-- Same as before, plus: paused during bulk imports (the importer refreshes each product
-- once at the end), and cross-reference changes refresh the product.
create or replace function public.refresh_product_search()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('eurocargo.skip_search_refresh', true), '') = 'on' then
    return null;
  end if;
  -- Only cross references are part of the search text (the others mirror product columns).
  -- (Nested IF: NEW/OLD of other tables have no "kind" field.)
  if tg_table_name = 'product_references' then
    if coalesce(new.kind, old.kind) <> 'cross' then
      return null;
    end if;
  end if;
  if tg_table_name in ('product_vehicle_compatibility', 'product_references') then
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

create trigger product_references_refresh_product_search
  after insert or update or delete on public.product_references
  for each row execute function public.refresh_product_search();

-- Rebuild search_text with the new definition without touching updated_at.
alter table public.products disable trigger products_set_updated_at;
update public.products set search_text = search_text;
alter table public.products enable trigger products_set_updated_at;

-- ════════════════════════════════════════════════════════════════════
-- Pricing: same rules, callable by the importer (service_role) too
-- ════════════════════════════════════════════════════════════════════

-- Body of the previous admin_recalculate_price(), without the admin check.
-- Not executable by API roles; admins go through admin_recalculate_price().
create or replace function public.catalog_compute_price(p_product_id uuid, p_apply boolean default true)
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

-- Same signature, checks and result as before.
create or replace function public.admin_recalculate_price(p_product_id uuid, p_apply boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return public.catalog_compute_price(p_product_id, p_apply);
end;
$$;

-- ════════════════════════════════════════════════════════════════════
-- Public search: indexed candidates, synonyms, stems, references, engine filters
-- ════════════════════════════════════════════════════════════════════
-- p_params (all optional):
--   query, reference, oe, make_id, model_id, variant_id, year, fuel, engine (e.g. "hdi"),
--   engine_cc (e.g. 1600: matches variants within ±60 cc), category_id, condition, brand_id,
--   availability, limit (max 60), offset.
-- Returns {total, total_capped, terms, items[]} with the same item shape as search_products().
-- Runs with the caller's rights (RLS: active products only for the public).
create or replace function public.catalog_search(p_params jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  c_cap       constant integer := 1000;
  v_p         jsonb := case when jsonb_typeof(p_params) = 'object' then p_params else '{}'::jsonb end;
  v_query     text := left(v_p ->> 'query', 300);
  v_ref       text := left(public.normalize_ref(v_p ->> 'reference'), 80);
  v_oe        text := left(public.normalize_ref(v_p ->> 'oe'), 80);
  v_make      uuid;
  v_model     uuid;
  v_variant   uuid;
  v_category  uuid;
  v_brand     uuid;
  v_year      integer;
  v_cc        integer;
  v_fuel      text := nullif(v_p ->> 'fuel', '');
  v_engine    text := nullif(public.normalize_search(left(v_p ->> 'engine', 40)), '');
  v_condition public.part_condition;
  v_avail     public.product_availability;
  v_limit     integer := 24;
  v_offset    integer := 0;
  v_terms     text[];
  v_patterns  text[] := '{}';
  v_pat_idx   integer[] := '{}';
  v_term      text;
  v_i         integer := 0;
  v_alt       text;
  v_has_text  boolean;
  v_n         integer;
  v_group     text;
  v_and       text;
  v_pass      text;
  v_term_hits text;
  v_filter    text;
  v_from      text;
  v_total     integer;
  v_page      jsonb;
  v_result    jsonb;
begin
  -- Tolerant parsing: invalid values are ignored rather than failing the search.
  if v_p ->> 'make_id' ~* '^[0-9a-f-]{36}$' then v_make := (v_p ->> 'make_id')::uuid; end if;
  if v_p ->> 'model_id' ~* '^[0-9a-f-]{36}$' then v_model := (v_p ->> 'model_id')::uuid; end if;
  if v_p ->> 'variant_id' ~* '^[0-9a-f-]{36}$' then v_variant := (v_p ->> 'variant_id')::uuid; end if;
  if v_p ->> 'category_id' ~* '^[0-9a-f-]{36}$' then v_category := (v_p ->> 'category_id')::uuid; end if;
  if v_p ->> 'brand_id' ~* '^[0-9a-f-]{36}$' then v_brand := (v_p ->> 'brand_id')::uuid; end if;
  if v_p ->> 'year' ~ '^\d{4}$' then v_year := (v_p ->> 'year')::integer; end if;
  if v_p ->> 'engine_cc' ~ '^\d{3,5}$' then v_cc := (v_p ->> 'engine_cc')::integer; end if;
  if v_p ->> 'condition' in ('new', 'used') then v_condition := (v_p ->> 'condition')::public.part_condition; end if;
  if v_p ->> 'availability' in ('in_stock', 'on_order', 'on_request', 'out_of_stock') then
    v_avail := (v_p ->> 'availability')::public.product_availability;
  end if;
  if v_fuel not in ('petrol', 'diesel', 'hybrid', 'electric', 'lpg', 'other') then v_fuel := null; end if;
  if v_p ->> 'limit' ~ '^\d+$' then v_limit := least(greatest((v_p ->> 'limit')::integer, 1), 60); end if;
  if v_p ->> 'offset' ~ '^\d+$' then v_offset := least((v_p ->> 'offset')::integer, 100000); end if;
  if length(v_ref) < 3 then v_ref := ''; end if;
  if length(v_oe) < 3 then v_oe := ''; end if;
  -- A model or variant implies its make.
  if v_variant is not null and v_model is null then
    select model_id into v_model from public.vehicle_variants where id = v_variant;
  end if;
  if v_model is not null and v_make is null then
    select make_id into v_make from public.vehicle_models where id = v_model;
  end if;

  select coalesce(array_agg(w order by first_pos), '{}') into v_terms
  from (
    select w, min(pos) as first_pos
    from regexp_split_to_table(public.normalize_search(v_query), '[^a-z0-9]+') with ordinality as t(w, pos)
    where length(w) >= 2
      and w <> all (array['de', 'da', 'do', 'das', 'dos', 'para', 'com', 'um', 'uma', 'the', 'for', 'and', 'with',
                          'del', 'la', 'el', 'los', 'las', 'le', 'les', 'des', 'du', 'pour', 'et', 'und', 'der',
                          'die', 'fur', 'mit', 'per', 'di', 'il', 'con', 'en', 'no', 'na', 'of'])
    group by w
    order by min(pos)
    limit 8
  ) x;

  -- Each term matches through its stem or any synonym (stemmed too).
  foreach v_term in array v_terms loop
    v_i := v_i + 1;
    v_patterns := v_patterns || public.search_stem(v_term);
    v_pat_idx := v_pat_idx || v_i;
    for v_alt in
      select distinct public.search_stem(s)
      from public.search_synonyms ss, unnest(ss.synonyms) s
      where ss.active and public.search_stem(ss.term) = public.search_stem(v_term)
    loop
      if v_alt <> '' and length(v_alt) >= 2 then
        v_patterns := v_patterns || v_alt;
        v_pat_idx := v_pat_idx || v_i;
      end if;
    end loop;
  end loop;

  v_has_text := cardinality(v_terms) > 0 or v_ref <> '' or v_oe <> '';

  -- Shared filters ($1..$12). Vehicle data that a compatibility row leaves open
  -- (no variant = every engine of the model) does not exclude the product.
  v_filter := $f$
    p.active
    and ($1::uuid is null or p.category_id = $1
         or p.category_id in (select c.id from public.part_categories c where c.parent_id = $1))
    and ($2::public.part_condition is null or p.condition = $2)
    and ($3::uuid is null or p.brand_id = $3)
    and ($4::public.product_availability is null or p.availability = $4)
    and ($5::uuid is null or exists (
          select 1 from public.product_vehicle_compatibility c
          left join public.vehicle_variants vv on vv.id = c.variant_id
          where c.product_id = p.id and c.make_id = $5
            and ($6::uuid is null or c.model_id is null or c.model_id = $6)
            and ($7::uuid is null or c.variant_id is null or c.variant_id = $7)
            and ($8::integer is null or ((c.year_from is null or c.year_from <= $8) and (c.year_to is null or c.year_to >= $8)))
            and (vv.id is null or (
                  ($8::integer is null or ((vv.year_from is null or vv.year_from <= $8) and (vv.year_to is null or vv.year_to >= $8)))
              and ($9::text is null or vv.fuel is null or vv.fuel = $9)
              and ($10::integer is null or vv.engine_cc is null or vv.engine_cc between $10 - 60 and $10 + 60)
              and ($11::text is null or public.normalize_search(concat_ws(' ', vv.name, vv.engine_code)) like '%' || $11 || '%')))))
  $f$;

  -- Text search in two passes, both on the trigram index:
  --   1. "all": products matching EVERY term (one bitmap AND/OR scan — selective and fast);
  --   2. "any": only when (1) finds nothing, products matching SOME terms, ranked by how many.
  -- References / OE numbers come from the product_references index in both passes.
  if cardinality(v_terms) > 0 then
    for v_n in 1 .. cardinality(v_terms) loop
      select '(' || string_agg(format('p.search_text like %L', '%' || x.pat || '%'), ' or ') || ')'
        into v_group
      from unnest(v_patterns, v_pat_idx) as x(pat, idx)
      where x.idx = v_n;
      v_and := concat_ws(' and ', v_and, v_group);
    end loop;
  end if;

  foreach v_pass in array case when cardinality(v_terms) > 1 then array['all', 'any'] else array['all'] end loop
    if v_has_text then
      v_term_hits := case
        when cardinality(v_terms) = 0 then
          'select null::uuid as id, 0 as matched_terms where false'
        when v_pass = 'all' then
          format('select p.id, %s as matched_terms from public.products p where %s', cardinality(v_terms), v_and)
        else $q$
          -- Bounded per pattern: partial matches of very common words never scan the whole catalogue.
          select p.id, count(distinct x.idx)::integer as matched_terms
          from unnest($12::text[], $13::integer[]) as x(pat, idx)
          cross join lateral (
            select p.id from public.products p
            where p.active and p.search_text like '%' || x.pat || '%'
            limit 2000
          ) p
          group by p.id $q$
      end;
      v_from := $q$
        with term_hits as ($q$ || v_term_hits || $q$),
        ref_hits as (
          select distinct r.product_id as id
          from public.product_references r
          where ($14 <> '' and r.reference_norm = $14)
             or ($15 <> '' and r.reference_norm = $15 and r.kind in ('oe', 'cross'))
        ),
        hits as (
          select id, max(matched_terms) as matched_terms, bool_or(ref_match) as ref_match
          from (select id, matched_terms, false as ref_match from term_hits
                union all select id, 0, true from ref_hits) u
          group by id
        ),
        filtered as materialized (
          select p.id, p.name, p.price, h.matched_terms, h.ref_match
          from hits h join public.products p on p.id = h.id
          where $q$ || v_filter || $q$
        )
      $q$;
    else
      v_from := $q$
        with filtered as materialized (
          select p.id, p.name, p.price, 0 as matched_terms, false as ref_match
          from public.products p
          where $q$ || v_filter || $q$
        )
      $q$;
    end if;

    execute v_from || $q$
      select (select count(*) from (select 1 from filtered limit $16) c)::integer,
             (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'm', f.matched_terms, 'r', f.ref_match)
                                        order by f.ref_match desc, f.matched_terms desc, (f.price is null), f.price, f.name), '[]'::jsonb)
                from (select * from filtered
                      order by ref_match desc, matched_terms desc, (price is null), price, name
                      limit $17 offset $18) f)
    $q$
    into v_total, v_page
    using v_category, v_condition, v_brand, v_avail, v_make, v_model, v_variant, v_year, v_fuel, v_cc, v_engine,
          v_patterns, v_pat_idx, v_ref, v_oe, c_cap, v_limit, v_offset;

    exit when v_total > 0;
  end loop;

  select jsonb_build_object(
    'total', v_total,
    'total_capped', v_total >= c_cap,
    'terms', to_jsonb(v_terms),
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'name_i18n', p.name_i18n,
      'part_number', p.part_number,
      'oe_numbers', to_jsonb(p.oe_numbers),
      'manufacturer', p.manufacturer,
      'group_key', p.group_key,
      'brand', (select b.name from public.brands b where b.id = p.brand_id),
      'category', (select jsonb_build_object('id', c.id, 'slug', c.slug, 'name', c.name, 'name_i18n', c.name_i18n)
                   from public.part_categories c where c.id = p.category_id),
      'condition', p.condition,
      'price', p.price,
      'currency', p.currency,
      'availability', p.availability,
      'stock_quantity', p.stock_quantity,
      'lead_time_days', p.lead_time_days,
      'is_demo', p.is_demo,
      'data_source', p.data_source,
      'updated_at', greatest(p.updated_at, coalesce(p.source_updated_at, p.updated_at)),
      'image', (select i.url from public.product_images i where i.product_id = p.id
                order by i.is_primary desc, i.position, i.created_at limit 1),
      'compatibility', coalesce((
        select jsonb_agg(jsonb_build_object('make', mk.name, 'model', md.name, 'variant', vv.name,
                                            'year_from', pc.year_from, 'year_to', pc.year_to, 'position', pc.position)
                         order by pc.ord)
        from (select x.*, row_number() over (order by
                (v_make is not null and x.make_id = v_make) desc,
                (v_model is not null and x.model_id = v_model) desc, x.created_at) as ord
              from public.product_vehicle_compatibility x where x.product_id = p.id
              order by ord limit 6) pc
        join public.vehicle_makes mk on mk.id = pc.make_id
        left join public.vehicle_models md on md.id = pc.model_id
        left join public.vehicle_variants vv on vv.id = pc.variant_id), '[]'::jsonb),
      'matched_terms', (pg.value ->> 'm')::integer,
      'ref_match', (pg.value ->> 'r')::boolean
    ) order by pg.ordinality), '[]'::jsonb)
  ) into v_result
  from jsonb_array_elements(v_page) with ordinality pg
  join public.products p on p.id = (pg.value ->> 'id')::uuid;

  return v_result;
end;
$$;

-- What the website needs to route catalogue calls (no configuration, notes or suppliers).
create or replace function public.catalog_public_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'sources', coalesce(jsonb_agg(jsonb_build_object('key', s.key, 'kind', s.kind, 'mode', s.mode,
                                                     'capabilities', to_jsonb(s.capabilities))
                                  order by s.priority desc, s.key), '[]'::jsonb)
  )
  from public.catalog_sources s
  where s.enabled;
$$;

-- ════════════════════════════════════════════════════════════════════
-- Bulk import
-- ════════════════════════════════════════════════════════════════════
-- Canonical row (JSON object; produced by the admin importer or an Edge Function adapter):
-- {
--   "external_id", "sku", "reference", "oe_numbers": [..], "ean", "cross_references": [{"reference","brand"}],
--   "name", "name_i18n": {..}, "description", "brand", "manufacturer", "category" ("Pai > Filho" allowed),
--   "condition": "new"|"used", "price" (public), "currency", "cost" (supplier), "cost_currency",
--   "stock", "availability", "lead_time_days", "active", "specs": {..}, "source_updated_at",
--   "supplier", "supplier_reference", "supplier_url",
--   "images": [{"url", "alt", "license", "source", "is_primary", "original_url"}],
--   "vehicles": [{"make", "model", "generation", "variant", "engine_code", "fuel", "engine_cc",
--                 "power_kw", "power_hp", "year_from", "year_to", "position", "notes", "verified"}],
--   "_row": <line number in the file, for error messages>
-- }
-- Nothing is invented: missing fields stay empty (price NULL = "price on request").

-- Find (or create, when allowed) reference data by name.
create or replace function public.catalog_find_brand(p_name text, p_create boolean, p_source text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := left(nullif(btrim(p_name), ''), 80);
  v_slug text := public.slugify(p_name);
  v_id   uuid;
begin
  if v_name is null or v_slug = '' then
    return null;
  end if;
  select id into v_id from public.brands where slug = v_slug or lower(name) = lower(v_name) order by (slug = v_slug) desc limit 1;
  if v_id is null and p_create then
    insert into public.brands (name, slug) values (v_name, v_slug)
    on conflict (slug) do update set name = public.brands.name
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.catalog_find_category(p_path text, p_create boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_part   text;
  v_parent uuid;
  v_id     uuid;
begin
  if nullif(btrim(p_path), '') is null then
    return null;
  end if;
  -- "Travagem > Pastilhas": each level is matched by slug, name or translation.
  foreach v_part in array regexp_split_to_array(p_path, '\s*>\s*') loop
    v_part := left(nullif(btrim(v_part), ''), 80);
    continue when v_part is null;
    select c.id into v_id
    from public.part_categories c
    where (v_parent is null or c.parent_id = v_parent)
      and (c.slug = public.slugify(v_part)
           or public.normalize_search(c.name) = public.normalize_search(v_part)
           or exists (select 1 from jsonb_each_text(c.name_i18n) t
                      where public.normalize_search(t.value) = public.normalize_search(v_part)))
    order by (c.parent_id is not distinct from v_parent) desc
    limit 1;
    if v_id is null then
      if not p_create or public.slugify(v_part) = '' then
        return null;
      end if;
      insert into public.part_categories (parent_id, slug, name)
      values (v_parent,
              case when exists (select 1 from public.part_categories where slug = public.slugify(v_part))
                   then left(public.slugify(v_part) || '-' || substr(md5(coalesce(v_parent::text, '') || v_part), 1, 6), 80)
                   else public.slugify(v_part) end,
              v_part)
      returning id into v_id;
    end if;
    v_parent := v_id;
    v_id := null;
  end loop;
  return v_parent;
end;
$$;

create or replace function public.catalog_find_supplier(p_name text, p_create boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := left(nullif(btrim(p_name), ''), 120);
  v_id   uuid;
begin
  if v_name is null then
    return null;
  end if;
  select id into v_id from public.suppliers where lower(name) = lower(v_name) and not is_demo limit 1;
  if v_id is null and p_create then
    insert into public.suppliers (name) values (v_name) returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- One compatibility entry: resolves / creates make → model → variant, then links the product.
create or replace function public.catalog_import_vehicle(p_product_id uuid, v jsonb, p_create boolean, p_source text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_make_name  text := left(nullif(btrim(v ->> 'make'), ''), 60);
  v_model_name text := left(nullif(btrim(v ->> 'model'), ''), 80);
  v_var_name   text := left(nullif(btrim(v ->> 'variant'), ''), 120);
  v_code       text := left(nullif(btrim(v ->> 'engine_code'), ''), 40);
  v_fuel       text := case when v ->> 'fuel' in ('petrol', 'diesel', 'hybrid', 'electric', 'lpg', 'other') then v ->> 'fuel' end;
  v_cc         integer := case when v ->> 'engine_cc' ~ '^\d{1,5}$' then (v ->> 'engine_cc')::integer end;
  v_kw         integer := case when v ->> 'power_kw' ~ '^\d{1,4}$' then (v ->> 'power_kw')::integer end;
  v_hp         integer := case when v ->> 'power_hp' ~ '^\d{1,4}$' then (v ->> 'power_hp')::integer end;
  v_y1         integer := case when v ->> 'year_from' ~ '^\d{4}$' then (v ->> 'year_from')::integer end;
  v_y2         integer := case when v ->> 'year_to' ~ '^\d{4}$' then (v ->> 'year_to')::integer end;
  v_position   text := left(nullif(btrim(v ->> 'position'), ''), 80);
  v_notes      text := left(nullif(btrim(v ->> 'notes'), ''), 500);
  v_make       uuid;
  v_model      uuid;
  v_variant    uuid;
begin
  if v_make_name is null then
    raise exception 'vehicle_without_make';
  end if;
  if v_y1 is not null and v_y2 is not null and v_y2 < v_y1 then
    raise exception 'invalid_vehicle_years';
  end if;

  select id into v_make from public.vehicle_makes
  where slug = public.slugify(v_make_name) or lower(name) = lower(v_make_name) limit 1;
  if v_make is null then
    if not p_create then raise exception 'unknown_vehicle_make: %', v_make_name; end if;
    insert into public.vehicle_makes (name, slug, data_source) values (v_make_name, public.slugify(v_make_name), p_source)
    returning id into v_make;
  end if;

  if v_model_name is not null then
    select id into v_model from public.vehicle_models
    where make_id = v_make
      and (slug = public.slugify(v_model_name) or public.normalize_search(name) = public.normalize_search(v_model_name))
    limit 1;
    if v_model is null then
      if not p_create then raise exception 'unknown_vehicle_model: %', v_model_name; end if;
      insert into public.vehicle_models (make_id, name, slug, generation, data_source)
      values (v_make, v_model_name, public.slugify(v_model_name), left(nullif(btrim(v ->> 'generation'), ''), 80), p_source)
      returning id into v_model;
    end if;

    -- Variant only when the source gives engine data; its name is built from that data.
    if v_var_name is null and (v_code is not null or v_cc is not null or v_kw is not null) then
      v_var_name := left(concat_ws(' ',
        case when v_cc is not null then to_char(round(v_cc / 1000.0, 1), 'FM0.0') end,
        v_fuel, case when v_kw is not null then v_kw || ' kW' end, v_code), 120);
    end if;
    if v_var_name is not null then
      select id into v_variant from public.vehicle_variants
      where model_id = v_model
        and public.normalize_search(name) = public.normalize_search(v_var_name)
        and (v_code is null or engine_code is null or upper(engine_code) = upper(v_code))
      limit 1;
      if v_variant is null then
        if not p_create then raise exception 'unknown_vehicle_variant: %', v_var_name; end if;
        insert into public.vehicle_variants (model_id, name, engine_code, fuel, engine_cc, power_kw, power_hp,
                                             year_from, year_to, data_source)
        values (v_model, v_var_name, v_code, v_fuel,
                case when v_cc between 1 and 20000 then v_cc end,
                case when v_kw between 1 and 2000 then v_kw end,
                case when v_hp between 1 and 2700 then v_hp end,
                case when v_y1 between 1900 and 2100 then v_y1 end,
                case when v_y2 between 1900 and 2100 then v_y2 end, p_source)
        returning id into v_variant;
      end if;
    end if;
  end if;

  insert into public.product_vehicle_compatibility (product_id, make_id, model_id, variant_id, year_from, year_to,
                                                    position, notes, source, verified)
  select p_product_id, v_make, v_model, v_variant, v_y1, v_y2, v_position, v_notes, p_source,
         coalesce((v ->> 'verified')::boolean, false)
  where not exists (
    select 1 from public.product_vehicle_compatibility c
    where c.product_id = p_product_id and c.make_id = v_make
      and c.model_id is not distinct from v_model and c.variant_id is not distinct from v_variant
      and c.year_from is not distinct from v_y1 and c.year_to is not distinct from v_y2
      and c.position is not distinct from v_position);
end;
$$;

-- Imports one canonical row. Returns {"status": "inserted"|"updated"|"skipped", "warnings": [...]}.
create or replace function public.catalog_import_one(p_row jsonb, p_batch public.catalog_import_batches,
                                                     p_source public.catalog_sources)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ds        text := p_batch.data_source;
  v_create    boolean := coalesce((p_batch.options ->> 'create_reference_data')::boolean, true);
  v_ext       text := left(nullif(btrim(p_row ->> 'external_id'), ''), 120);
  v_sku       text := left(nullif(btrim(p_row ->> 'sku'), ''), 60);
  v_ref       text := left(nullif(btrim(p_row ->> 'reference'), ''), 80);
  v_name      text := left(nullif(btrim(p_row ->> 'name'), ''), 200);
  v_brand     uuid;
  v_category  uuid;
  v_supplier  uuid;
  v_cond      public.part_condition;
  v_row_cond  public.part_condition;
  v_avail     public.product_availability;
  v_price     numeric;
  v_cost      numeric;
  v_currency  text;
  v_stock     integer;
  v_lead      integer;
  v_oe        text[];
  v_ean       text := nullif(regexp_replace(coalesce(p_row ->> 'ean', ''), '\s', '', 'g'), '');
  v_existing  public.products;
  v_id        uuid;
  v_status    text;
  v_warnings  jsonb := '[]'::jsonb;
  v_item      jsonb;
  v_pos       integer;
  v_image_id  uuid;
  v_url       text;
  v_license   text;
begin
  if jsonb_typeof(p_row) <> 'object' then
    raise exception 'invalid_row';
  end if;

  -- Condition: row → source default. Never guessed.
  v_row_cond := case lower(coalesce(p_row ->> 'condition', '')) when 'new' then 'new' when 'used' then 'used' end;
  v_cond := coalesce(v_row_cond, p_source.default_condition);

  if nullif(btrim(p_row ->> 'brand'), '') is not null then
    v_brand := public.catalog_find_brand(p_row ->> 'brand', v_create, v_ds);
    if v_brand is null then
      v_warnings := v_warnings || to_jsonb('unknown_brand: ' || (p_row ->> 'brand'));
    end if;
  end if;

  if v_ext is null and v_sku is null and (v_ref is null or v_brand is null) then
    raise exception 'missing_identifier';
  end if;

  -- Existing product: source id → SKU → brand + reference + condition. Demo products are never matched.
  if v_ext is not null then
    select * into v_existing from public.products where data_source = v_ds and external_id = v_ext;
  end if;
  if v_existing.id is null and v_sku is not null then
    select * into v_existing from public.products where sku = v_sku and not is_demo;
  end if;
  if v_existing.id is null and v_ref is not null and v_brand is not null and v_cond is not null then
    select * into v_existing from public.products
    where brand_id = v_brand and part_number is not null
      and public.normalize_ref(part_number) = public.normalize_ref(v_ref)
      and condition = v_cond and not is_demo
    limit 1;
  end if;

  if v_existing.id is null and p_batch.mode = 'update_only' then
    return jsonb_build_object('status', 'skipped', 'warnings', v_warnings || to_jsonb('not_found_update_only'::text));
  end if;
  if v_existing.id is not null and p_batch.mode = 'insert_only' then
    return jsonb_build_object('status', 'skipped', 'warnings', v_warnings || to_jsonb('exists_insert_only'::text));
  end if;
  if v_existing.id is not null and v_existing.is_demo then
    raise exception 'demo_product_conflict';
  end if;

  if v_existing.id is null then
    if v_name is null or char_length(v_name) < 2 then
      raise exception 'missing_name';
    end if;
    if v_cond is null then
      raise exception 'missing_condition';
    end if;
  end if;

  if nullif(btrim(p_row ->> 'category'), '') is not null then
    v_category := public.catalog_find_category(p_row ->> 'category', v_create);
    if v_category is null then
      v_warnings := v_warnings || to_jsonb('unknown_category: ' || (p_row ->> 'category'));
    end if;
  end if;

  if p_row ->> 'price' is not null then
    if (p_row ->> 'price') !~ '^\d+(\.\d+)?$' then raise exception 'invalid_price'; end if;
    v_price := round((p_row ->> 'price')::numeric, 2);
  end if;
  if p_row ->> 'cost' is not null then
    if (p_row ->> 'cost') !~ '^\d+(\.\d+)?$' then raise exception 'invalid_cost'; end if;
    v_cost := round((p_row ->> 'cost')::numeric, 2);
  end if;
  v_currency := upper(coalesce(nullif(p_row ->> 'currency', ''), p_source.default_currency, 'EUR'));
  if v_currency !~ '^[A-Z]{3}$' then raise exception 'invalid_currency'; end if;
  if p_row ->> 'stock' is not null then
    if (p_row ->> 'stock') !~ '^\d+$' then raise exception 'invalid_stock'; end if;
    v_stock := (p_row ->> 'stock')::integer;
  end if;
  if p_row ->> 'lead_time_days' ~ '^\d+$' then
    v_lead := least((p_row ->> 'lead_time_days')::integer, 365);
  end if;
  -- Availability from the source; otherwise only what the stock figure says.
  v_avail := case
    when p_row ->> 'availability' in ('in_stock', 'on_order', 'on_request', 'out_of_stock')
      then (p_row ->> 'availability')::public.product_availability
    when v_stock > 0 then 'in_stock'
    when v_stock = 0 then 'out_of_stock'
  end;

  if jsonb_typeof(p_row -> 'oe_numbers') = 'array' then
    select coalesce(array_agg(distinct left(btrim(x), 80)), '{}') into v_oe
    from jsonb_array_elements_text(p_row -> 'oe_numbers') x where btrim(x) <> '';
    v_oe := v_oe[1:50];
  end if;
  if v_ean is not null and v_ean !~ '^[0-9]{8,14}$' then
    v_warnings := v_warnings || to_jsonb('invalid_ean'::text);
    v_ean := null;
  end if;

  if v_existing.id is null then
    insert into public.products (
      sku, name, name_i18n, description, brand_id, category_id, manufacturer, part_number, oe_numbers, ean,
      condition, price, currency, price_mode, availability, stock_quantity, lead_time_days, specs,
      data_source, external_id, source_updated_at, last_synced_at, active)
    values (
      v_sku, v_name,
      case when jsonb_typeof(p_row -> 'name_i18n') = 'object' then p_row -> 'name_i18n' else '{}'::jsonb end,
      left(nullif(btrim(p_row ->> 'description'), ''), 5000), v_brand, v_category,
      left(nullif(btrim(p_row ->> 'manufacturer'), ''), 120), v_ref, coalesce(v_oe, '{}'), v_ean,
      v_cond, v_price, v_currency,
      case when v_price is null and v_cost is not null then 'rules' else 'manual' end,
      coalesce(v_avail, 'on_request'), v_stock, v_lead,
      case when jsonb_typeof(p_row -> 'specs') = 'object' then p_row -> 'specs' else '{}'::jsonb end,
      v_ds, v_ext, (p_row ->> 'source_updated_at')::timestamptz, now(),
      coalesce((p_row ->> 'active')::boolean, true))
    returning id into v_id;
    v_status := 'inserted';
  else
    -- Fields missing from the row keep their current value.
    update public.products set
      sku               = coalesce(v_sku, sku),
      name              = coalesce(v_name, name),
      name_i18n         = case when jsonb_typeof(p_row -> 'name_i18n') = 'object' then name_i18n || (p_row -> 'name_i18n') else name_i18n end,
      description       = coalesce(left(nullif(btrim(p_row ->> 'description'), ''), 5000), description),
      brand_id          = coalesce(v_brand, brand_id),
      category_id       = coalesce(v_category, category_id),
      manufacturer      = coalesce(left(nullif(btrim(p_row ->> 'manufacturer'), ''), 120), manufacturer),
      part_number       = coalesce(v_ref, part_number),
      oe_numbers        = coalesce(v_oe, oe_numbers),
      ean               = coalesce(v_ean, ean),
      condition         = coalesce(v_row_cond, condition),
      price             = coalesce(v_price, price),
      currency          = case when v_price is not null then v_currency else currency end,
      price_mode        = case when v_price is not null then 'manual' else price_mode end,
      availability      = coalesce(v_avail, availability),
      stock_quantity    = coalesce(v_stock, stock_quantity),
      lead_time_days    = coalesce(v_lead, lead_time_days),
      specs             = case when jsonb_typeof(p_row -> 'specs') = 'object' then specs || (p_row -> 'specs') else specs end,
      external_id       = coalesce(external_id, v_ext),
      source_updated_at = coalesce((p_row ->> 'source_updated_at')::timestamptz, source_updated_at),
      last_synced_at    = now(),
      active            = coalesce((p_row ->> 'active')::boolean, active)
    where id = v_existing.id;
    v_id := v_existing.id;
    v_status := 'updated';
  end if;

  -- Cross references (equivalent parts of other brands).
  if jsonb_typeof(p_row -> 'cross_references') = 'array' then
    for v_item in select value from jsonb_array_elements(p_row -> 'cross_references') loop
      if jsonb_typeof(v_item) = 'object' and public.normalize_ref(v_item ->> 'reference') <> '' then
        insert into public.product_references (product_id, kind, reference, reference_norm, brand, source)
        values (v_id, 'cross', left(btrim(v_item ->> 'reference'), 80), public.normalize_ref(v_item ->> 'reference'),
                left(nullif(btrim(v_item ->> 'brand'), ''), 80), v_ds)
        on conflict (product_id, kind, reference_norm) do nothing;
      end if;
    end loop;
  end if;

  -- Vehicles.
  if jsonb_typeof(p_row -> 'vehicles') = 'array' then
    for v_item in select value from jsonb_array_elements(p_row -> 'vehicles') loop
      begin
        perform public.catalog_import_vehicle(v_id, v_item, v_create, v_ds);
      exception when others then
        v_warnings := v_warnings || to_jsonb('vehicle: ' || sqlerrm);
      end;
    end loop;
  end if;

  -- Images: only HTTPS URLs from the source, with a licence (row or source). Never fetched or copied here.
  if jsonb_typeof(p_row -> 'images') = 'array' then
    select coalesce(max(position) + 1, 0) into v_pos from public.product_images where product_id = v_id;
    for v_item in select value from jsonb_array_elements(p_row -> 'images') loop
      v_url := left(btrim(case when jsonb_typeof(v_item) = 'string' then v_item #>> '{}' else v_item ->> 'url' end), 1000);
      v_license := left(nullif(btrim(coalesce(v_item ->> 'license', p_source.image_license, '')), ''), 200);
      if v_url is null or v_url !~ '^https://' then
        v_warnings := v_warnings || to_jsonb('image_not_https'::text);
        continue;
      end if;
      if v_license is null then
        v_warnings := v_warnings || to_jsonb('image_without_license'::text);
        continue;
      end if;
      continue when exists (select 1 from public.product_images where product_id = v_id and url = v_url);
      insert into public.product_images (product_id, url, alt, position, source, license, data_source, is_primary)
      values (v_id, v_url,
              left(nullif(btrim(v_item ->> 'alt'), ''), 200), v_pos,
              left(coalesce(nullif(btrim(v_item ->> 'source'), ''), p_source.name), 200),
              v_license, v_ds,
              -- Primary: the first image of a product without images, or the one the source flags
              -- (only while the product has no primary image yet).
              not exists (select 1 from public.product_images where product_id = v_id and is_primary)
                and (coalesce((v_item ->> 'is_primary')::boolean, false)
                     or not exists (select 1 from public.product_images where product_id = v_id)))
      returning id into v_image_id;
      insert into public.product_image_sources (image_id, original_url, source_id, supplier_id)
      values (v_image_id, left(coalesce(nullif(v_item ->> 'original_url', ''), v_url), 1000), p_source.id, p_source.supplier_id);
      v_pos := v_pos + 1;
    end loop;
  end if;

  -- Supplier offer (internal: cost, supplier reference, stock, lead time, origin URL).
  v_supplier := coalesce(public.catalog_find_supplier(p_row ->> 'supplier', v_create), p_source.supplier_id);
  if v_supplier is not null and (v_cost is not null or p_row ? 'supplier_reference' or v_stock is not null) then
    insert into public.supplier_products (supplier_id, product_id, supplier_sku, cost_price, currency, stock_quantity,
                                          lead_time_days, condition, availability, source_url, external_id, last_synced_at)
    values (v_supplier, v_id, left(nullif(btrim(p_row ->> 'supplier_reference'), ''), 80), v_cost,
            upper(coalesce(nullif(p_row ->> 'cost_currency', ''), v_currency)), v_stock, v_lead, v_cond,
            coalesce(v_avail, 'on_request'),
            case when p_row ->> 'supplier_url' ~ '^https?://' then left(p_row ->> 'supplier_url', 500) end,
            v_ext, now())
    on conflict (supplier_id, product_id) do update set
      supplier_sku   = coalesce(excluded.supplier_sku, public.supplier_products.supplier_sku),
      cost_price     = coalesce(excluded.cost_price, public.supplier_products.cost_price),
      currency       = excluded.currency,
      stock_quantity = coalesce(excluded.stock_quantity, public.supplier_products.stock_quantity),
      lead_time_days = coalesce(excluded.lead_time_days, public.supplier_products.lead_time_days),
      condition      = coalesce(excluded.condition, public.supplier_products.condition),
      availability   = case when v_avail is not null then excluded.availability else public.supplier_products.availability end,
      source_url     = coalesce(excluded.source_url, public.supplier_products.source_url),
      external_id    = coalesce(excluded.external_id, public.supplier_products.external_id),
      last_synced_at = now();
  elsif v_cost is not null then
    v_warnings := v_warnings || to_jsonb('cost_without_supplier'::text);
  end if;

  -- Public price from the pricing rules when the product is priced by rules.
  if exists (select 1 from public.products where id = v_id and price_mode = 'rules') then
    begin
      perform public.catalog_compute_price(v_id, true);
    exception when others then
      v_warnings := v_warnings || to_jsonb('price: ' || sqlerrm);
    end;
  end if;

  -- One search-text rebuild per product (compatibility triggers are paused during imports).
  update public.products set search_text = search_text where id = v_id;

  return jsonb_build_object('status', v_status, 'warnings', v_warnings);
end;
$$;

-- Opens an import batch. Bare version: service_role only (Edge Functions).
create or replace function public.catalog_import_start(
  p_source_id  uuid,
  p_format     text,
  p_file_name  text default null,
  p_mode       text default 'upsert',
  p_options    jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.catalog_sources;
  v_id     uuid;
begin
  select * into v_source from public.catalog_sources where id = p_source_id;
  if not found then
    raise exception 'catalog_source_not_found';
  end if;
  if not v_source.enabled then
    raise exception 'catalog_source_disabled';
  end if;
  insert into public.catalog_import_batches (source_id, data_source, format, file_name, mode, options)
  values (v_source.id, v_source.key, p_format, left(p_file_name, 200), coalesce(p_mode, 'upsert'),
          case when jsonb_typeof(p_options) = 'object' then p_options else '{}'::jsonb end)
  returning id into v_id;
  return v_id;
end;
$$;

-- Imports up to 1000 rows; each row in its own sub-transaction (one bad row never aborts the rest).
create or replace function public.catalog_import_rows(p_batch_id uuid, p_rows jsonb, p_row_offset integer default 0)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch    public.catalog_import_batches;
  v_source   public.catalog_sources;
  v_row      jsonb;
  v_index    integer := 0;
  v_line     integer;
  v_res      jsonb;
  v_ins      integer := 0;
  v_upd      integer := 0;
  v_skip     integer := 0;
  v_fail     integer := 0;
  v_errors   jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
begin
  select * into v_batch from public.catalog_import_batches where id = p_batch_id for update;
  if not found then
    raise exception 'import_batch_not_found';
  end if;
  if v_batch.status <> 'running' then
    raise exception 'import_batch_closed';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 1000 then
    raise exception 'invalid_import_rows';
  end if;
  select * into v_source from public.catalog_sources where id = v_batch.source_id;

  perform set_config('eurocargo.skip_search_refresh', 'on', true);
  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_index := v_index + 1;
    v_line := coalesce(case when v_row ->> '_row' ~ '^\d+$' then (v_row ->> '_row')::integer end,
                       coalesce(p_row_offset, 0) + v_index);
    begin
      v_res := public.catalog_import_one(v_row, v_batch, v_source);
      case v_res ->> 'status'
        when 'inserted' then v_ins := v_ins + 1;
        when 'updated' then v_upd := v_upd + 1;
        else v_skip := v_skip + 1;
      end case;
      if jsonb_array_length(v_res -> 'warnings') > 0 and jsonb_array_length(v_warnings) < 200 then
        v_warnings := v_warnings || jsonb_build_object('row', v_line, 'warnings', v_res -> 'warnings');
      end if;
    exception when others then
      v_fail := v_fail + 1;
      if jsonb_array_length(v_errors) < 200 then
        v_errors := v_errors || jsonb_build_object('row', v_line, 'error', left(sqlerrm, 300));
      end if;
    end;
  end loop;
  perform set_config('eurocargo.skip_search_refresh', 'off', true);

  update public.catalog_import_batches set
    total_rows = total_rows + v_index,
    inserted = inserted + v_ins,
    updated = updated + v_upd,
    skipped = skipped + v_skip,
    failed = failed + v_fail,
    errors = case when jsonb_array_length(errors) < 500 then errors || v_errors else errors end
  where id = p_batch_id;

  return jsonb_build_object('inserted', v_ins, 'updated', v_upd, 'skipped', v_skip, 'failed', v_fail,
                            'errors', v_errors, 'warnings', v_warnings);
end;
$$;

-- Closes the batch and records the source's last synchronisation.
create or replace function public.catalog_import_finish(p_batch_id uuid, p_cancelled boolean default false,
                                                        p_sync_cursor text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch  public.catalog_import_batches;
  v_status text;
begin
  select * into v_batch from public.catalog_import_batches where id = p_batch_id for update;
  if not found then
    raise exception 'import_batch_not_found';
  end if;
  if v_batch.status <> 'running' then
    return to_jsonb(v_batch);
  end if;
  v_status := case
    when p_cancelled then 'cancelled'
    when v_batch.failed = 0 then 'completed'
    when v_batch.inserted + v_batch.updated = 0 then 'failed'
    else 'partial' end;

  update public.catalog_import_batches set status = v_status, finished_at = now()
  where id = p_batch_id
  returning * into v_batch;

  update public.catalog_sources set
    last_sync_at = now(),
    last_sync_status = case v_status when 'completed' then 'ok' when 'failed' then 'failed' else 'partial' end,
    last_sync_message = left(format('%s: %s inserted, %s updated, %s skipped, %s failed',
                                    v_batch.format, v_batch.inserted, v_batch.updated, v_batch.skipped, v_batch.failed), 1000),
    sync_cursor = coalesce(p_sync_cursor, sync_cursor)
  where id = v_batch.source_id;

  insert into public.admin_actions (admin_user_id, action, entity_type, entity_id, details)
  values (auth.uid(), 'catalog_imported', 'catalog_import', v_batch.id,
          jsonb_build_object('source', v_batch.data_source, 'format', v_batch.format, 'file', v_batch.file_name,
                             'status', v_status, 'inserted', v_batch.inserted, 'updated', v_batch.updated,
                             'skipped', v_batch.skipped, 'failed', v_batch.failed));
  return to_jsonb(v_batch);
end;
$$;

-- Admin wrappers (the website's importer).
create or replace function public.admin_catalog_import_start(
  p_source_id uuid, p_format text, p_file_name text default null, p_mode text default 'upsert',
  p_options jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return public.catalog_import_start(p_source_id, p_format, p_file_name, p_mode, p_options);
end;
$$;

create or replace function public.admin_catalog_import_rows(p_batch_id uuid, p_rows jsonb, p_row_offset integer default 0)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return public.catalog_import_rows(p_batch_id, p_rows, p_row_offset);
end;
$$;

create or replace function public.admin_catalog_import_finish(p_batch_id uuid, p_cancelled boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return public.catalog_import_finish(p_batch_id, p_cancelled, null);
end;
$$;

-- Default sources: manual file uploads (enabled) and TecDoc (prepared, disabled until contracted).
insert into public.catalog_sources (key, name, kind, mode, enabled, priority, capabilities, notes) values
  ('ficheiros', 'Importação de ficheiros (CSV / JSON / XML)', 'file', 'import', true, 0, '{}',
   'Ficheiros carregados em Admin → Catálogo → Importação.'),
  ('tecdoc', 'TecDoc (TecAlliance)', 'tecdoc', 'live', false, 100,
   array['search', 'reference', 'oe', 'vehicle', 'vin', 'images', 'compatibility'],
   'Preparado, inativo. Requer contrato TecAlliance e os secrets CATALOG_PROVIDER/CATALOG_API_URL/CATALOG_API_KEY.')
on conflict (key) do nothing;

-- ════════════════════════════════════════════════════════════════════
-- Row Level Security
-- ════════════════════════════════════════════════════════════════════
alter table public.product_references     enable row level security;
alter table public.product_image_sources  enable row level security;
alter table public.catalog_sources        enable row level security;
alter table public.catalog_import_batches enable row level security;
alter table public.catalog_live_queries   enable row level security;
alter table public.search_synonyms        enable row level security;

do $$
declare t text;
begin
  foreach t in array array['product_references', 'product_image_sources', 'catalog_sources',
                           'catalog_import_batches', 'catalog_live_queries', 'search_synonyms']
  loop
    execute format('create policy %I on public.%I for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))',
                   t || ': admin all', t);
  end loop;
end;
$$;

create policy "product_references: public read" on public.product_references for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.active));
create policy "search_synonyms: public read" on public.search_synonyms for select to anon, authenticated
  using (active);

revoke all on public.product_references, public.product_image_sources, public.catalog_sources,
              public.catalog_import_batches, public.catalog_live_queries, public.search_synonyms
  from anon, authenticated;
grant select on public.product_references, public.search_synonyms to anon, authenticated;
grant select on public.product_image_sources, public.catalog_sources, public.catalog_import_batches,
                public.catalog_live_queries
  to authenticated;
grant insert, update, delete on public.product_references, public.product_image_sources, public.catalog_sources,
                                public.search_synonyms
  to authenticated;
grant all on public.product_references, public.product_image_sources, public.catalog_sources,
             public.catalog_import_batches, public.catalog_live_queries, public.search_synonyms
  to service_role;

-- ════════════════════════════════════════════════════════════════════
-- Function privileges (Supabase grants EXECUTE to anon/authenticated by default)
-- ════════════════════════════════════════════════════════════════════
revoke execute on function
  public.slugify(text), public.search_stem(text),
  public.product_references_before_write(), public.products_sync_references(),
  public.catalog_compute_price(uuid, boolean),
  public.catalog_search(jsonb), public.catalog_public_config(),
  public.catalog_find_brand(text, boolean, text), public.catalog_find_category(text, boolean),
  public.catalog_find_supplier(text, boolean), public.catalog_import_vehicle(uuid, jsonb, boolean, text),
  public.catalog_import_one(jsonb, public.catalog_import_batches, public.catalog_sources),
  public.catalog_import_start(uuid, text, text, text, jsonb),
  public.catalog_import_rows(uuid, jsonb, integer),
  public.catalog_import_finish(uuid, boolean, text),
  public.admin_catalog_import_start(uuid, text, text, text, jsonb),
  public.admin_catalog_import_rows(uuid, jsonb, integer),
  public.admin_catalog_import_finish(uuid, boolean)
from public, anon, authenticated;

-- catalog_search runs as the caller: its helpers must be callable too.
grant execute on function public.search_stem(text), public.catalog_search(jsonb), public.catalog_public_config()
  to anon, authenticated;
grant execute on function
  public.admin_catalog_import_start(uuid, text, text, text, jsonb),
  public.admin_catalog_import_rows(uuid, jsonb, integer),
  public.admin_catalog_import_finish(uuid, boolean)
to authenticated;
-- Edge Functions (catalog-sync, catalog-external) run as service_role.
grant execute on function
  public.search_stem(text), public.catalog_search(jsonb), public.catalog_public_config(),
  public.catalog_compute_price(uuid, boolean),
  public.catalog_import_start(uuid, text, text, text, jsonb),
  public.catalog_import_rows(uuid, jsonb, integer),
  public.catalog_import_finish(uuid, boolean, text)
to service_role;
