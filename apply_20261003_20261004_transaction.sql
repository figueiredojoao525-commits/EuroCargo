-- EuroCargo — 20261003 + 20261004 (modelo vendedor) + 20261004000100 (DEMO alargado), numa única transação.
-- Colar inteiro no Supabase → SQL Editor → Run. Se der erro, nada fica aplicado.
begin;

-- ═════ 20261003000000_catalog_import_match_fix ═════
-- ════════════════════════════════════════════════════════════════════
-- EuroCargo — catalogue import fix (after 20261002000000_catalog_scale_import).
--C:\Users\topro\OneDrive\Desktop\EuroCargo\apply_20261003_20261004_transaction.sql
-- catalog_import_one(): a row identified by brand + reference WITHOUT a condition
-- (typical supplier price / stock update feed) now updates the existing product when
-- exactly one product matches. If the same part exists new AND used, the row fails with
-- "ambiguous_condition" (nothing is guessed). Everything else is unchanged.
-- Same signature; privileges are kept by CREATE OR REPLACE (not executable by API roles).
-- ════════════════════════════════════════════════════════════════════

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
  v_matches   integer;
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
  if v_existing.id is null and v_ref is not null and v_brand is not null then
    -- Without a condition (e.g. a price/stock update feed) the reference must be unambiguous:
    -- when the same part exists new AND used, the row is rejected instead of guessing.
    select count(*) into v_matches from public.products
    where brand_id = v_brand and part_number is not null
      and public.normalize_ref(part_number) = public.normalize_ref(v_ref)
      and (v_cond is null or condition = v_cond) and not is_demo;
    if v_matches > 1 and v_cond is null then
      raise exception 'ambiguous_condition';
    end if;
    select * into v_existing from public.products
    where brand_id = v_brand and part_number is not null
      and public.normalize_ref(part_number) = public.normalize_ref(v_ref)
      and (v_cond is null or condition = v_cond) and not is_demo
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

-- ═════ 20261004000000_eurocargo_seller_model ═════
-- ════════════════════════════════════════════════════════════════════
-- EuroCargo — seller model: EuroCargo is the seller; suppliers are internal.
--
-- * One product = one commercial result, whatever the number of internal suppliers.
--   Each supplier's offer (cost, stock, lead time, article code) is a supplier_products row.
-- * The system picks the best offer by the admin's strategy (catalog_settings.offer_strategy:
--   cheapest | stock | fastest | preferred), aggregates stock / availability across suppliers
--   and prices the product from the chosen offer with the pricing rules.
-- * Customers (anon / authenticated) can no longer read internal columns: source keys,
--   supplier article codes, pricing mode, sync dates, chosen supplier (column privileges).
--   Admins read them through the admin_products view and admin_* functions.
--
-- Incremental and non-destructive: no data or policy is removed. Functions are replaced by
-- compatible versions (same signatures). Includes the 20261003 import fix.
-- ════════════════════════════════════════════════════════════════════

-- ─────────────── Internal supplier ranking ───────────────
alter table public.suppliers
  add column priority integer not null default 0,
  add column preferred boolean not null default false;

-- Which offer the system chooses (one row, admin only).
create table public.catalog_settings (
  id              boolean primary key default true check (id),
  offer_strategy  text not null default 'cheapest'
                  check (offer_strategy in ('cheapest', 'stock', 'fastest', 'preferred')),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users (id) on delete set null default auth.uid()
);
insert into public.catalog_settings (id) values (true) on conflict (id) do nothing;

create trigger catalog_settings_set_updated_at
  before update on public.catalog_settings
  for each row execute function public.set_updated_at();

-- The supplier offer behind the current product data (internal).
alter table public.products
  add column selected_supplier_id uuid references public.suppliers (id) on delete set null;

create index supplier_products_product_active_idx on public.supplier_products (product_id) where active;

-- ─────────────── Offer helpers ───────────────

-- An offer counts as "in stock" when the supplier says so (and the quantity is not 0) or has quantity.
create or replace function public.catalog_offer_in_stock(sp public.supplier_products)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (sp.availability = 'in_stock' and coalesce(sp.stock_quantity, 1) > 0) or coalesce(sp.stock_quantity, 0) > 0;
$$;

-- Best active offer of a product according to the strategy. p_need_cost: only offers with a cost
-- (for pricing). Always: in-stock offers first, then the strategy, then cost / lead time / priority.
create or replace function public.catalog_best_offer(p_product_id uuid, p_need_cost boolean default false)
returns public.supplier_products
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_strategy text;
  v_offer    public.supplier_products;
begin
  select offer_strategy into v_strategy from public.catalog_settings where id;
  v_strategy := coalesce(v_strategy, 'cheapest');
  select sp.* into v_offer
  from public.supplier_products sp
  join public.suppliers s on s.id = sp.supplier_id and s.active
  where sp.product_id = p_product_id and sp.active and (not p_need_cost or sp.cost_price is not null)
  order by
    case when v_strategy = 'preferred' then (not s.preferred)::integer else 0 end,
    case when v_strategy = 'preferred' then -s.priority else 0 end,
    (not public.catalog_offer_in_stock(sp))::integer,
    case when v_strategy = 'stock' then -coalesce(sp.stock_quantity, 0) else 0 end,
    case when v_strategy = 'fastest' then coalesce(sp.lead_time_days, 999) else 0 end,
    sp.cost_price nulls last,
    coalesce(sp.lead_time_days, 999),
    -s.priority,
    sp.created_at
  limit 1;
  return v_offer;
end;
$$;

-- Most specific active pricing rule for a product / supplier / cost
-- (product > supplier > category > condition > price band > global, then priority).
create or replace function public.catalog_match_rule(p_product public.products, p_supplier_id uuid, p_cost numeric)
returns public.price_rules
language sql
stable
security definer
set search_path = ''
as $$
  select r.*
  from public.price_rules r
  where r.active and (
       (r.scope = 'product' and r.product_id = p_product.id)
    or (r.scope = 'supplier' and r.supplier_id = p_supplier_id)
    or (r.scope = 'category' and r.category_id = p_product.category_id)
    or (r.scope = 'condition' and r.condition = p_product.condition)
    or (r.scope = 'price_band' and (r.min_cost is null or p_cost >= r.min_cost) and (r.max_cost is null or p_cost < r.max_cost))
    or r.scope = 'global')
  order by case r.scope when 'product' then 1 when 'supplier' then 2 when 'category' then 3
                        when 'condition' then 4 when 'price_band' then 5 else 6 end,
           r.priority desc, r.created_at
  limit 1;
$$;

-- EuroCargo price from the BEST offer (strategy) and the rules. Same result shape as before.
-- With the default strategy ("cheapest", in stock first) the choice is the same as before.
create or replace function public.catalog_compute_price(p_product_id uuid, p_apply boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
  v_offer   public.supplier_products;
  v_rule    public.price_rules;
  v_price   numeric;
begin
  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    raise exception 'product_not_found';
  end if;

  v_offer := public.catalog_best_offer(p_product_id, true);
  if v_offer.id is null then
    raise exception 'no_supplier_cost';
  end if;

  v_rule := public.catalog_match_rule(v_product, v_offer.supplier_id, v_offer.cost_price);
  if v_rule.id is null then
    raise exception 'no_price_rule';
  end if;

  v_price := greatest(round(v_offer.cost_price * (1 + v_rule.margin_percent / 100) + v_rule.fixed_amount, 2), 0);

  if p_apply then
    perform set_config('eurocargo.skip_price_history', 'on', true);
    update public.products set price = v_price, currency = v_offer.currency, price_mode = 'rules'
    where id = p_product_id;
    perform set_config('eurocargo.skip_price_history', 'off', true);
    if v_price is distinct from v_product.price then
      insert into public.product_price_history (product_id, old_price, new_price, cost_price, supplier_id, rule_id, reason, changed_by)
      values (p_product_id, v_product.price, v_price, v_offer.cost_price, v_offer.supplier_id, v_rule.id, 'rule', auth.uid());
    end if;
  end if;

  return jsonb_build_object('product_id', p_product_id, 'cost', v_offer.cost_price, 'currency', v_offer.currency,
                            'supplier_id', v_offer.supplier_id, 'rule_id', v_rule.id, 'rule_name', v_rule.name,
                            'margin_percent', v_rule.margin_percent, 'fixed_amount', v_rule.fixed_amount,
                            'old_price', v_product.price, 'price', v_price, 'applied', p_apply);
end;
$$;

-- Recomputes a product from all its active supplier offers:
--   stock = sum of the suppliers' stock; availability = in stock if any supplier has it, else on order,
--   else on request, else unavailable; lead time of the fastest matching offer; chosen supplier;
--   EuroCargo price (pricing rules) when the product is priced by rules.
-- Products without supplier offers keep their manual values.
create or replace function public.catalog_refresh_offers(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count   integer;
  v_any_in  boolean;
  v_avail   public.product_availability;
  v_stock   bigint;
  v_lead    integer;
  v_best    public.supplier_products;
  v_priced  public.supplier_products;
begin
  select count(*),
         bool_or(public.catalog_offer_in_stock(sp)),
         sum(sp.stock_quantity),
         case
           when bool_or(public.catalog_offer_in_stock(sp)) then 'in_stock'
           when bool_or(sp.availability = 'on_order') then 'on_order'
           when bool_or(sp.availability = 'on_request') then 'on_request'
           else 'out_of_stock'
         end::public.product_availability
    into v_count, v_any_in, v_stock, v_avail
  from public.supplier_products sp
  join public.suppliers s on s.id = sp.supplier_id and s.active
  where sp.product_id = p_product_id and sp.active;

  if v_count = 0 then
    update public.products set selected_supplier_id = null
    where id = p_product_id and selected_supplier_id is not null;
    return;
  end if;

  select min(sp.lead_time_days) into v_lead
  from public.supplier_products sp
  join public.suppliers s on s.id = sp.supplier_id and s.active
  where sp.product_id = p_product_id and sp.active
    and case when v_avail = 'in_stock' then public.catalog_offer_in_stock(sp)
             when v_avail = 'on_order' then sp.availability = 'on_order'
             else false end;

  v_best := public.catalog_best_offer(p_product_id, false);
  v_priced := public.catalog_best_offer(p_product_id, true);

  update public.products set
    stock_quantity = least(v_stock, 2147483647)::integer,
    availability = v_avail,
    lead_time_days = least(v_lead, 365),
    selected_supplier_id = coalesce(v_priced.supplier_id, v_best.supplier_id)
  where id = p_product_id;

  if exists (select 1 from public.products where id = p_product_id and price_mode = 'rules') then
    begin
      perform public.catalog_compute_price(p_product_id, true);
    exception when others then
      null; -- no cost / no rule: the price stays as it is ("on request" when empty)
    end;
  end if;
end;
$$;

-- Offer changes refresh the product (paused during bulk imports; the importer refreshes once per product).
create or replace function public.supplier_products_refresh()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('eurocargo.skip_offer_refresh', true), '') = 'on' then
    return null;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.catalog_refresh_offers(new.product_id);
  end if;
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.product_id <> new.product_id) then
    perform public.catalog_refresh_offers(old.product_id);
  end if;
  return null;
end;
$$;

create trigger supplier_products_refresh
  after insert or update or delete on public.supplier_products
  for each row execute function public.supplier_products_refresh();

-- Supplier switched on/off or re-ranked: its products are recomputed.
create or replace function public.suppliers_refresh_products()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  for v_id in select distinct product_id from public.supplier_products where supplier_id = new.id loop
    perform public.catalog_refresh_offers(v_id);
  end loop;
  return null;
end;
$$;

create trigger suppliers_refresh_products
  after update of active, preferred, priority on public.suppliers
  for each row execute function public.suppliers_refresh_products();

-- ─────────────── Search text: also a compact form of the name ───────────────
create or replace function public.build_product_search_text(p public.products)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select public.normalize_search(concat_ws(' ',
    p.name,
    -- Compact form so "5W-30", "H7 12V" match "5w30", "h712v".
    public.normalize_ref(p.name),
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

alter table public.products disable trigger products_set_updated_at;
update public.products set search_text = search_text;
alter table public.products enable trigger products_set_updated_at;

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
      'updated_at', p.updated_at,
      'image', (select i.url from public.product_images i where i.product_id = p.id
                order by i.is_primary desc, i.position, i.created_at limit 1),
      'compatibility', coalesce((
        select jsonb_agg(jsonb_build_object('make', mk.name, 'model', md.name, 'variant', vv.name,
                                            'year_from', pc.year_from, 'year_to', pc.year_to, 'position', pc.position)
                         order by pc.ord)
        from (select x.make_id, x.model_id, x.variant_id, x.year_from, x.year_to, x.position,
                     row_number() over (order by
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
  v_matches   integer;
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

  -- Internal supplier of this row (row → source's supplier).
  v_supplier := coalesce(public.catalog_find_supplier(p_row ->> 'supplier', v_create), p_source.supplier_id);

  -- Existing product: the supplier's article code (one product, many supplier offers) → source id →
  -- SKU → brand + reference + condition. Demo products are never matched.
  if v_ext is not null and v_supplier is not null then
    select p.* into v_existing from public.supplier_products sp
    join public.products p on p.id = sp.product_id
    where sp.supplier_id = v_supplier and sp.external_id = v_ext and not p.is_demo
    limit 1;
  end if;
  if v_existing.id is null and v_ext is not null then
    select * into v_existing from public.products where data_source = v_ds and external_id = v_ext;
  end if;
  if v_existing.id is null and v_sku is not null then
    select * into v_existing from public.products where sku = v_sku and not is_demo;
  end if;
  if v_existing.id is null and v_ref is not null and v_brand is not null then
    -- Without a condition (e.g. a price/stock update feed) the reference must be unambiguous:
    -- when the same part exists new AND used, the row is rejected instead of guessing.
    select count(*) into v_matches from public.products
    where brand_id = v_brand and part_number is not null
      and public.normalize_ref(part_number) = public.normalize_ref(v_ref)
      and (v_cond is null or condition = v_cond) and not is_demo;
    if v_matches > 1 and v_cond is null then
      raise exception 'ambiguous_condition';
    end if;
    select * into v_existing from public.products
    where brand_id = v_brand and part_number is not null
      and public.normalize_ref(part_number) = public.normalize_ref(v_ref)
      and (v_cond is null or condition = v_cond) and not is_demo
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
      case when v_supplier is null then coalesce(v_avail, 'on_request') else 'on_request' end,
      case when v_supplier is null then v_stock end,
      case when v_supplier is null then v_lead end,
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
      availability      = case when v_supplier is null then coalesce(v_avail, availability) else availability end,
      stock_quantity    = case when v_supplier is null then coalesce(v_stock, stock_quantity) else stock_quantity end,
      lead_time_days    = case when v_supplier is null then coalesce(v_lead, lead_time_days) else lead_time_days end,
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
              -- Credit only when the source gives one: never the supplier's name by default.
              left(nullif(btrim(v_item ->> 'source'), ''), 200),
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

  -- Best internal offer, aggregated stock / availability and the EuroCargo price (pricing rules).
  perform public.catalog_refresh_offers(v_id);
  if exists (select 1 from public.products where id = v_id and price_mode = 'rules' and price is null) then
    v_warnings := v_warnings || to_jsonb('price: no_supplier_cost_or_rule'::text);
  end if;

  -- One search-text rebuild per product (compatibility triggers are paused during imports).
  update public.products set search_text = search_text where id = v_id;

  return jsonb_build_object('status', v_status, 'warnings', v_warnings);
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
  perform set_config('eurocargo.skip_offer_refresh', 'on', true);
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
  perform set_config('eurocargo.skip_offer_refresh', 'off', true);

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

-- ════════════════════════════════════════════════════════════════════
-- Compatible replacements
-- ════════════════════════════════════════════════════════════════════

-- Original public search: same signature and result shape, now served by catalog_search()
-- (the old body read every product column, which customers can no longer do).
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
language sql
stable
security invoker
set search_path = ''
as $$
  select public.catalog_search(jsonb_strip_nulls(jsonb_build_object(
    'query', p_query, 'make_id', p_make_id, 'model_id', p_model_id, 'year', p_year,
    'category_id', p_category_id, 'condition', p_condition, 'brand_id', p_brand_id,
    'reference', p_reference, 'limit', p_limit, 'offset', p_offset)));
$$;

-- Public view of the enabled sources: kinds and capabilities only (no keys, which could name a supplier).
create or replace function public.catalog_public_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'sources', coalesce(jsonb_agg(jsonb_build_object('kind', s.kind, 'mode', s.mode,
                                                     'capabilities', to_jsonb(s.capabilities))
                                  order by s.priority desc), '[]'::jsonb)
  )
  from public.catalog_sources s
  where s.enabled;
$$;

-- DEMO removal also covers DEMO vehicles (data_source = 'demo') no longer used by real products.
create or replace function public.admin_purge_demo_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_products  integer;
  v_suppliers integer;
  v_rules     integer;
  v_brands    integer;
  v_variants  integer;
  v_models    integer;
  v_makes     integer;
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
  delete from public.vehicle_variants v where v.data_source = 'demo'
    and not exists (select 1 from public.product_vehicle_compatibility c where c.variant_id = v.id);
  get diagnostics v_variants = row_count;
  delete from public.vehicle_models m where m.data_source = 'demo'
    and not exists (select 1 from public.product_vehicle_compatibility c where c.model_id = m.id)
    and not exists (select 1 from public.vehicle_variants v where v.model_id = m.id);
  get diagnostics v_models = row_count;
  delete from public.vehicle_makes k where k.data_source = 'demo'
    and not exists (select 1 from public.product_vehicle_compatibility c where c.make_id = k.id)
    and not exists (select 1 from public.vehicle_models m where m.make_id = k.id);
  get diagnostics v_makes = row_count;
  insert into public.admin_actions (admin_user_id, action, entity_type, details)
  values (auth.uid(), 'demo_data_purged', 'catalog',
          jsonb_build_object('products', v_products, 'suppliers', v_suppliers, 'rules', v_rules, 'brands', v_brands,
                             'vehicles', v_variants + v_models + v_makes));
  return jsonb_build_object('products', v_products, 'suppliers', v_suppliers, 'rules', v_rules, 'brands', v_brands,
                            'vehicles', v_variants + v_models + v_makes);
end;
$$;

-- ════════════════════════════════════════════════════════════════════
-- Admin access to internal data
-- ════════════════════════════════════════════════════════════════════

-- Every product column, admins only (customers read the public columns of public.products).
create view public.admin_products with (security_barrier = true) as
  select p.* from public.products p where (select public.is_admin());

-- Product → internal offers: supplier, cost, stock, lead time, chosen offer, rule, margin and
-- the EuroCargo price each offer would give.
create or replace function public.admin_product_offers(p_product_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_product public.products;
  v_result  jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_product from public.products where id = p_product_id;
  if not found then
    raise exception 'product_not_found';
  end if;
  select jsonb_build_object(
    'strategy', (select offer_strategy from public.catalog_settings where id),
    'selected_supplier_id', v_product.selected_supplier_id,
    'price_mode', v_product.price_mode,
    'price', v_product.price,
    'currency', v_product.currency,
    'availability', v_product.availability,
    'stock_quantity', v_product.stock_quantity,
    'lead_time_days', v_product.lead_time_days,
    'offers', coalesce(jsonb_agg(jsonb_build_object(
      'id', sp.id,
      'supplier_id', s.id,
      'supplier_name', s.name,
      'supplier_active', s.active,
      'supplier_is_demo', s.is_demo,
      'preferred', s.preferred,
      'priority', s.priority,
      'supplier_sku', sp.supplier_sku,
      'external_id', sp.external_id,
      'cost_price', sp.cost_price,
      'currency', sp.currency,
      'stock_quantity', sp.stock_quantity,
      'availability', sp.availability,
      'lead_time_days', sp.lead_time_days,
      'in_stock', public.catalog_offer_in_stock(sp),
      'active', sp.active,
      'last_synced_at', sp.last_synced_at,
      'source_url', sp.source_url,
      'selected', sp.supplier_id = v_product.selected_supplier_id,
      'rule_name', r.name,
      'margin_percent', r.margin_percent,
      'fixed_amount', r.fixed_amount,
      'price', case when sp.cost_price is not null and r.id is not null
                    then greatest(round(sp.cost_price * (1 + r.margin_percent / 100) + r.fixed_amount, 2), 0) end
    ) order by sp.supplier_id = v_product.selected_supplier_id desc, sp.cost_price nulls last), '[]'::jsonb)
  ) into v_result
  from public.supplier_products sp
  join public.suppliers s on s.id = sp.supplier_id
  left join lateral (select * from public.catalog_match_rule(v_product, sp.supplier_id, sp.cost_price)) r on true
  where sp.product_id = p_product_id;
  return v_result;
end;
$$;

-- Re-run the offer choice for every product with supplier offers (after changing the strategy).
create or replace function public.admin_refresh_all_offers()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id    uuid;
  v_count integer := 0;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  for v_id in select distinct product_id from public.supplier_products loop
    perform public.catalog_refresh_offers(v_id);
    v_count := v_count + 1;
  end loop;
  insert into public.admin_actions (admin_user_id, action, entity_type, details)
  values (auth.uid(), 'offers_refreshed', 'catalog',
          jsonb_build_object('products', v_count,
                             'strategy', (select offer_strategy from public.catalog_settings where id)));
  return jsonb_build_object('products', v_count);
end;
$$;

-- Existing products with supplier offers get their aggregated data and chosen offer now.
do $$
declare v_id uuid;
begin
  for v_id in select distinct product_id from public.supplier_products loop
    perform public.catalog_refresh_offers(v_id);
  end loop;
end;
$$;

-- ════════════════════════════════════════════════════════════════════
-- Row Level Security and privileges
-- ════════════════════════════════════════════════════════════════════
alter table public.catalog_settings enable row level security;
create policy "catalog_settings: admin all" on public.catalog_settings for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
revoke all on public.catalog_settings from anon, authenticated;
grant select, update on public.catalog_settings to authenticated;
grant all on public.catalog_settings to service_role;

revoke all on public.admin_products from anon, authenticated;
grant select on public.admin_products to authenticated;
grant select on public.admin_products to service_role;

-- Customers (anon + authenticated, admins included at table level) read PUBLIC columns only.
-- Internal: products.data_source / external_id / price_mode / source_updated_at / last_synced_at /
-- selected_supplier_id, image / reference / compatibility / vehicle source keys.
-- Writes keep their table-level grants (RLS still restricts them to admins).
revoke select on public.products from anon, authenticated;
grant select (id, sku, name, name_i18n, description, brand_id, category_id, manufacturer, part_number, oe_numbers,
              ean, group_key, condition, price, currency, availability, stock_quantity, lead_time_days, specs,
              is_demo, active, search_text, created_at, updated_at)
  on public.products to anon, authenticated;

revoke select on public.product_images from anon, authenticated;
grant select (id, product_id, url, alt, position, source, license, is_primary, created_at)
  on public.product_images to anon, authenticated;

revoke select on public.product_vehicle_compatibility from anon, authenticated;
grant select (id, product_id, make_id, model_id, variant_id, year_from, year_to, position, notes, verified, created_at)
  on public.product_vehicle_compatibility to anon, authenticated;

revoke select on public.product_references from anon, authenticated;
grant select (id, product_id, kind, reference, reference_norm, brand, created_at)
  on public.product_references to anon, authenticated;

revoke select on public.vehicle_makes from anon, authenticated;
grant select (id, name, slug, active, created_at, updated_at) on public.vehicle_makes to anon, authenticated;

revoke select on public.vehicle_models from anon, authenticated;
grant select (id, make_id, name, slug, body_type, year_from, year_to, generation, active, created_at, updated_at)
  on public.vehicle_models to anon, authenticated;

revoke select on public.vehicle_variants from anon, authenticated;
grant select (id, model_id, name, engine_code, fuel, power_kw, power_hp, engine_cc, body_type, year_from, year_to,
              created_at, updated_at)
  on public.vehicle_variants to anon, authenticated;

-- ─────────────── Function privileges ───────────────
revoke execute on function
  public.catalog_offer_in_stock(public.supplier_products),
  public.catalog_best_offer(uuid, boolean),
  public.catalog_match_rule(public.products, uuid, numeric),
  public.catalog_refresh_offers(uuid),
  public.supplier_products_refresh(),
  public.suppliers_refresh_products(),
  public.admin_product_offers(uuid),
  public.admin_refresh_all_offers()
from public, anon, authenticated;

grant execute on function public.admin_product_offers(uuid), public.admin_refresh_all_offers() to authenticated;
grant execute on function public.catalog_refresh_offers(uuid) to service_role;

-- ═════ 20261004000100_demo_catalog_expansion ═════
-- ════════════════════════════════════════════════════════════════════
-- EuroCargo — larger DEMO catalogue (to fill and test the shop before the real catalogue)
--
-- Reference data kept for the real catalogue (not demo):
--   * new part categories (transmission, clutch, A/C, steering, exhaust, consumables, accessories).
-- DEMO data (removable with Admin → Preços → Apagar dados de demonstração / admin_purge_demo_data()):
--   * vehicles added here: data_source = 'demo' (real makes / models / production years, used to
--     exercise search; removed when no real product uses them);
--   * brands "DEMO …", products is_demo = true (references "DM-…", no OE numbers, no EAN),
--     3 internal suppliers "Fornecedor A/B/C (DEMO)" with costs / stock / lead times, and
--     supplier-scoped DEMO pricing rules (they never price real suppliers' products).
-- The shop shows every DEMO product with the DEMO badge and "preço de demonstração".
-- Requires 20261004000000_eurocargo_seller_model.
-- ════════════════════════════════════════════════════════════════════

-- ─────────────── Categories (real reference data) ───────────────
insert into public.part_categories (slug, name, name_i18n, icon, position) values
  ('transmissao',     'Transmissão',      '{"es":"Transmisión","en":"Transmission","fr":"Transmission","de":"Antrieb","it":"Trasmissione"}', 'gear', 90),
  ('embraiagem',      'Embraiagem',       '{"es":"Embrague","en":"Clutch","fr":"Embrayage","de":"Kupplung","it":"Frizione"}', 'clutch', 100),
  ('ar-condicionado', 'Ar condicionado',  '{"es":"Aire acondicionado","en":"Air conditioning","fr":"Climatisation","de":"Klimaanlage","it":"Aria condizionata"}', 'snow', 110),
  ('direcao',         'Direção',          '{"es":"Dirección","en":"Steering","fr":"Direction","de":"Lenkung","it":"Sterzo"}', 'steering', 120),
  ('escape',          'Escape',           '{"es":"Escape","en":"Exhaust","fr":"Échappement","de":"Abgasanlage","it":"Scarico"}', 'exhaust', 130),
  ('consumiveis',     'Consumíveis',      '{"es":"Consumibles","en":"Consumables","fr":"Consommables","de":"Verbrauchsmaterial","it":"Materiali di consumo"}', 'drop', 140),
  ('acessorios',      'Acessórios',       '{"es":"Accesorios","en":"Accessories","fr":"Accessoires","de":"Zubehör","it":"Accessori"}', 'star', 150)
on conflict (slug) do nothing;

do $$
declare
  v_a        uuid;
  v_b        uuid;
  v_c        uuid;
  v_brand    uuid;
  v_product  uuid;
  v_used     uuid;
  v_make     uuid;
  v_model    uuid;
  v_variant  uuid;
  v_n        integer := 0;
  v_seed     integer;
  v_cost     numeric;
  v_ref      text;
  t          record;
  m          record;
  c_desc     constant text := 'Produto de demonstração para testar a loja — não é uma oferta real.';
begin
  -- Bulk seed: per-row search / offer refreshes are paused and done once per product at the end.
  perform set_config('eurocargo.skip_search_refresh', 'on', true);
  perform set_config('eurocargo.skip_offer_refresh', 'on', true);

  -- ── Internal DEMO suppliers (never shown to customers) ──
  insert into public.suppliers (name, country, notes, is_demo, priority, preferred) values
    ('Fornecedor A (DEMO)', 'PT', 'DEMO: custo baixo, pouco stock, entrega rápida.', true, 10, false)
  returning id into v_a;
  insert into public.suppliers (name, country, notes, is_demo, priority, preferred) values
    ('Fornecedor B (DEMO)', 'ES', 'DEMO: custo médio, bom stock.', true, 5, true)
  returning id into v_b;
  insert into public.suppliers (name, country, notes, is_demo, priority, preferred) values
    ('Fornecedor C (DEMO)', 'PT', 'DEMO: custo mais alto, grande stock, peças usadas.', true, 0, false)
  returning id into v_c;

  -- EuroCargo margins for DEMO suppliers only.
  insert into public.price_rules (name, scope, supplier_id, margin_percent, fixed_amount, is_demo) values
    ('DEMO — margem Fornecedor A 32%', 'supplier', v_a, 32, 0, true),
    ('DEMO — margem Fornecedor B 30%', 'supplier', v_b, 30, 0, true),
    ('DEMO — margem Fornecedor C 28%', 'supplier', v_c, 28, 1, true);

  -- ── DEMO brands ──
  insert into public.brands (name, slug, is_demo) values
    ('DEMO Stopline', 'demo-stopline', true), ('DEMO Filtrex', 'demo-filtrex', true),
    ('DEMO Flexa', 'demo-flexa', true), ('DEMO Motorvia', 'demo-motorvia', true),
    ('DEMO Lumina', 'demo-lumina', true), ('DEMO Carroz', 'demo-carroz', true),
    ('DEMO Climax', 'demo-climax', true), ('DEMO Lubra', 'demo-lubra', true)
  on conflict (slug) do update set is_demo = true;

  -- ── Vehicles popular in Europe (real names and production years; data_source = 'demo') ──
  insert into public.vehicle_makes (name, slug, data_source)
  select x.name, x.slug, 'demo' from (values
    ('Citroën', 'citroen'), ('Ford', 'ford'), ('Opel', 'opel'), ('Toyota', 'toyota'), ('Fiat', 'fiat'),
    ('Mercedes-Benz', 'mercedes-benz'), ('Audi', 'audi'), ('Skoda', 'skoda'), ('Dacia', 'dacia'),
    ('Nissan', 'nissan'), ('Hyundai', 'hyundai'), ('Kia', 'kia')) x(name, slug)
  on conflict (slug) do nothing;

  insert into public.vehicle_models (make_id, name, slug, body_type, year_from, year_to, generation, data_source)
  select mk.id, x.name, x.slug, x.body, x.y1, x.y2, x.gen, 'demo'
  from (values
    ('peugeot',       '208',             '208',          'Hatchback', 2012, 2019, 'A9'),
    ('peugeot',       '308 (T9)',        '308-t9',       'Hatchback', 2013, 2021, 'T9'),
    ('renault',       'Clio IV',         'clio-iv',      'Hatchback', 2012, 2019, 'X98'),
    ('renault',       'Mégane III',      'megane-iii',   'Hatchback', 2008, 2016, 'X95'),
    ('volkswagen',    'Polo (6R)',       'polo-6r',      'Hatchback', 2009, 2017, '6R'),
    ('volkswagen',    'Golf VII',        'golf-vii',     'Hatchback', 2012, 2020, '5G'),
    ('seat',          'Leon III',        'leon-iii',     'Hatchback', 2012, 2020, '5F'),
    ('bmw',           'Série 1 (F20)',   'serie-1-f20',  'Hatchback', 2011, 2019, 'F20'),
    ('citroen',       'C3 II',           'c3-ii',        'Hatchback', 2009, 2016, 'SC'),
    ('citroen',       'C4',              'c4',           'Hatchback', 2004, 2010, 'LC'),
    ('ford',          'Focus III',       'focus-iii',    'Hatchback', 2011, 2018, 'Mk3'),
    ('ford',          'Fiesta VII',      'fiesta-vii',   'Hatchback', 2008, 2017, 'Mk7'),
    ('opel',          'Corsa D',         'corsa-d',      'Hatchback', 2006, 2014, 'D'),
    ('opel',          'Astra J',         'astra-j',      'Hatchback', 2009, 2015, 'J'),
    ('opel',          'Vectra C',        'vectra-c',     'Sedan',     2002, 2008, 'C'),
    ('toyota',        'Yaris III',       'yaris-iii',    'Hatchback', 2011, 2020, 'XP130'),
    ('fiat',          'Punto',           'punto',        'Hatchback', 2005, 2018, '199'),
    ('fiat',          '500',             '500',          'Hatchback', 2007, 2024, '312'),
    ('mercedes-benz', 'Classe A (W176)', 'classe-a-w176','Hatchback', 2012, 2018, 'W176'),
    ('audi',          'A3 (8V)',         'a3-8v',        'Hatchback', 2012, 2020, '8V'),
    ('skoda',         'Octavia III',     'octavia-iii',  'Liftback',  2013, 2020, '5E'),
    ('dacia',         'Sandero II',      'sandero-ii',   'Hatchback', 2012, 2020, 'B52'),
    ('nissan',        'Qashqai (J11)',   'qashqai-j11',  'SUV',       2013, 2021, 'J11'),
    ('hyundai',       'Accent',          'accent',       'Sedan',     1994, 1999, 'X3'),
    ('hyundai',       'i30 (GD)',        'i30-gd',       'Hatchback', 2011, 2017, 'GD'),
    ('kia',           'Ceed (JD)',       'ceed-jd',      'Hatchback', 2012, 2018, 'JD')
  ) as x(make, name, slug, body, y1, y2, gen)
  join public.vehicle_makes mk on mk.slug = x.make
  on conflict (make_id, slug) do nothing;

  -- Engine versions (well-known engines; used by engine-specific parts and the engine filter).
  insert into public.vehicle_variants (model_id, name, engine_code, fuel, engine_cc, power_kw, power_hp, year_from, year_to, data_source)
  select md.id, x.name, x.code, x.fuel, x.cc, x.kw, x.hp, x.y1, x.y2, 'demo'
  from (values
    ('peugeot',    '307-sw',    '1.6 HDi 110',      '9HZ', 'diesel', 1560, 80,  109, 2004, 2008),
    ('peugeot',    '208',       '1.2 PureTech 82',  null,  'petrol', 1199, 60,  82,  2012, 2019),
    ('peugeot',    '208',       '1.6 BlueHDi 100',  null,  'diesel', 1560, 73,  100, 2014, 2019),
    ('volkswagen', 'golf-vii',  '1.4 TSI',          null,  'petrol', 1395, 92,  125, 2012, 2020),
    ('volkswagen', 'golf-vii',  '1.6 TDI',          null,  'diesel', 1598, 81,  110, 2012, 2020),
    ('renault',    'clio-iv',   '0.9 TCe 90',       null,  'petrol', 898,  66,  90,  2012, 2019),
    ('renault',    'clio-iv',   '1.5 dCi 90',       null,  'diesel', 1461, 66,  90,  2012, 2019),
    ('ford',       'focus-iii', '1.0 EcoBoost',     null,  'petrol', 999,  92,  125, 2012, 2018),
    ('ford',       'focus-iii', '1.6 TDCi',         null,  'diesel', 1560, 85,  115, 2011, 2018)
  ) as x(make, model, name, code, fuel, cc, kw, hp, y1, y2)
  join public.vehicle_makes mk on mk.slug = x.make
  join public.vehicle_models md on md.make_id = mk.id and md.slug = x.model
  where not exists (select 1 from public.vehicle_variants v where v.model_id = md.id and v.name = x.name);

  -- ── Part templates × vehicles ──
  -- scope: 'model' (one product per selected model), 'engine' (fits a model's engine versions when it has
  -- them), 'universal' (one product, no vehicle). used: also a used version (manual price).
  for t in
    select row_number() over () as idx, x.*
    from (values
      ('travagem','Pastilhas de travão dianteiras','{"es":"Pastillas de freno delanteras","en":"Front brake pads","fr":"Plaquettes de frein avant","de":"Bremsbeläge vorne","it":"Pastiglie freno anteriori"}','Eixo dianteiro',22,'model',false,'demo-stopline'),
      ('travagem','Pastilhas de travão traseiras','{"es":"Pastillas de freno traseras","en":"Rear brake pads","fr":"Plaquettes de frein arrière","de":"Bremsbeläge hinten","it":"Pastiglie freno posteriori"}','Eixo traseiro',18,'model',false,'demo-stopline'),
      ('travagem','Disco de travão dianteiro','{"es":"Disco de freno delantero","en":"Front brake disc","fr":"Disque de frein avant","de":"Bremsscheibe vorne","it":"Disco freno anteriore"}','Eixo dianteiro',30,'model',false,'demo-stopline'),
      ('travagem','Disco de travão traseiro','{"es":"Disco de freno trasero","en":"Rear brake disc","fr":"Disque de frein arrière","de":"Bremsscheibe hinten","it":"Disco freno posteriore"}','Eixo traseiro',25,'model',false,'demo-stopline'),
      ('travagem','Pinça de travão dianteira esquerda','{"es":"Pinza de freno delantera izquierda","en":"Front left brake caliper","fr":"Étrier de frein avant gauche","de":"Bremssattel vorne links","it":"Pinza freno anteriore sinistra"}','Dianteira esquerda',55,'model',true,'demo-stopline'),
      ('filtros','Filtro de óleo','{"es":"Filtro de aceite","en":"Oil filter","fr":"Filtre à huile","de":"Ölfilter","it":"Filtro olio"}',null,6,'engine',false,'demo-filtrex'),
      ('filtros','Filtro de ar','{"es":"Filtro de aire","en":"Air filter","fr":"Filtre à air","de":"Luftfilter","it":"Filtro aria"}',null,9,'engine',false,'demo-filtrex'),
      ('filtros','Filtro de habitáculo','{"es":"Filtro de habitáculo","en":"Cabin filter","fr":"Filtre d''habitacle","de":"Innenraumfilter","it":"Filtro abitacolo"}',null,8,'model',false,'demo-filtrex'),
      ('filtros','Filtro de combustível','{"es":"Filtro de combustible","en":"Fuel filter","fr":"Filtre à carburant","de":"Kraftstofffilter","it":"Filtro carburante"}',null,12,'engine',false,'demo-filtrex'),
      ('suspensao','Amortecedor dianteiro','{"es":"Amortiguador delantero","en":"Front shock absorber","fr":"Amortisseur avant","de":"Stoßdämpfer vorne","it":"Ammortizzatore anteriore"}','Dianteiro',35,'model',true,'demo-flexa'),
      ('suspensao','Amortecedor traseiro','{"es":"Amortiguador trasero","en":"Rear shock absorber","fr":"Amortisseur arrière","de":"Stoßdämpfer hinten","it":"Ammortizzatore posteriore"}','Traseiro',30,'model',false,'demo-flexa'),
      ('suspensao','Mola de suspensão dianteira','{"es":"Muelle de suspensión delantero","en":"Front coil spring","fr":"Ressort de suspension avant","de":"Fahrwerksfeder vorne","it":"Molla anteriore"}','Dianteiro',28,'model',false,'demo-flexa'),
      ('suspensao','Bieleta da barra estabilizadora','{"es":"Bieleta de barra estabilizadora","en":"Stabiliser link","fr":"Biellette de barre stabilisatrice","de":"Koppelstange","it":"Biella barra stabilizzatrice"}','Dianteiro',9,'model',false,'demo-flexa'),
      ('suspensao','Braço de suspensão dianteiro esquerdo','{"es":"Brazo de suspensión delantero izquierdo","en":"Front left control arm","fr":"Bras de suspension avant gauche","de":"Querlenker vorne links","it":"Braccio sospensione anteriore sinistro"}','Dianteira esquerda',32,'model',true,'demo-flexa'),
      ('motor','Kit de distribuição','{"es":"Kit de distribución","en":"Timing belt kit","fr":"Kit de distribution","de":"Zahnriemensatz","it":"Kit distribuzione"}',null,65,'engine',false,'demo-motorvia'),
      ('motor','Bomba de água','{"es":"Bomba de agua","en":"Water pump","fr":"Pompe à eau","de":"Wasserpumpe","it":"Pompa acqua"}',null,32,'engine',false,'demo-motorvia'),
      ('motor','Correia de acessórios','{"es":"Correa de accesorios","en":"Auxiliary belt","fr":"Courroie d''accessoires","de":"Keilrippenriemen","it":"Cinghia servizi"}',null,14,'engine',false,'demo-motorvia'),
      ('motor','Junta da tampa das válvulas','{"es":"Junta de tapa de balancines","en":"Valve cover gasket","fr":"Joint de cache-culbuteurs","de":"Ventildeckeldichtung","it":"Guarnizione coperchio punterie"}',null,15,'engine',false,'demo-motorvia'),
      ('iluminacao','Farol dianteiro esquerdo','{"es":"Faro delantero izquierdo","en":"Front left headlight","fr":"Phare avant gauche","de":"Scheinwerfer vorne links","it":"Faro anteriore sinistro"}','Esquerdo',85,'model',true,'demo-lumina'),
      ('iluminacao','Farol dianteiro direito','{"es":"Faro delantero derecho","en":"Front right headlight","fr":"Phare avant droit","de":"Scheinwerfer vorne rechts","it":"Faro anteriore destro"}','Direito',85,'model',true,'demo-lumina'),
      ('iluminacao','Farolim traseiro esquerdo','{"es":"Piloto trasero izquierdo","en":"Rear left tail light","fr":"Feu arrière gauche","de":"Rückleuchte links","it":"Fanale posteriore sinistro"}','Esquerdo',45,'model',true,'demo-lumina'),
      ('iluminacao','Lâmpada H7 12V 55W (par)','{"es":"Lámpara H7 12V 55W (par)","en":"H7 bulb 12V 55W (pair)","fr":"Ampoule H7 12V 55W (paire)","de":"Glühlampe H7 12V 55W (Paar)","it":"Lampada H7 12V 55W (coppia)"}',null,4,'universal',false,'demo-lumina'),
      ('carrocaria','Retrovisor exterior esquerdo','{"es":"Retrovisor exterior izquierdo","en":"Left door mirror","fr":"Rétroviseur extérieur gauche","de":"Außenspiegel links","it":"Specchietto retrovisore sinistro"}','Esquerdo',40,'model',true,'demo-carroz'),
      ('carrocaria','Para-choques dianteiro','{"es":"Paragolpes delantero","en":"Front bumper","fr":"Pare-chocs avant","de":"Stoßfänger vorne","it":"Paraurti anteriore"}','Dianteiro',90,'model',true,'demo-carroz'),
      ('carrocaria','Grelha do para-choques','{"es":"Rejilla del paragolpes","en":"Bumper grille","fr":"Grille de pare-chocs","de":"Stoßfängergitter","it":"Griglia paraurti"}','Dianteiro',22,'model',false,'demo-carroz'),
      ('carrocaria','Escovas limpa-vidros dianteiras','{"es":"Escobillas limpiaparabrisas delanteras","en":"Front wiper blades","fr":"Balais d''essuie-glace avant","de":"Scheibenwischer vorne","it":"Spazzole tergicristallo anteriori"}','Dianteiro',8,'model',false,'demo-carroz'),
      ('transmissao','Semieixo de transmissão dianteiro esquerdo','{"es":"Palier delantero izquierdo","en":"Front left drive shaft","fr":"Cardan avant gauche","de":"Antriebswelle vorne links","it":"Semiasse anteriore sinistro"}','Dianteira esquerda',70,'model',true,'demo-motorvia'),
      ('transmissao','Junta homocinética','{"es":"Junta homocinética","en":"CV joint","fr":"Joint homocinétique","de":"Gleichlaufgelenk","it":"Giunto omocinetico"}','Dianteiro',35,'model',false,'demo-motorvia'),
      ('transmissao','Rolamento de roda dianteiro','{"es":"Rodamiento de rueda delantero","en":"Front wheel bearing","fr":"Roulement de roue avant","de":"Radlager vorne","it":"Cuscinetto ruota anteriore"}','Dianteiro',25,'model',false,'demo-motorvia'),
      ('embraiagem','Kit de embraiagem','{"es":"Kit de embrague","en":"Clutch kit","fr":"Kit d''embrayage","de":"Kupplungssatz","it":"Kit frizione"}',null,95,'engine',false,'demo-motorvia'),
      ('embraiagem','Volante bimassa','{"es":"Volante bimasa","en":"Dual-mass flywheel","fr":"Volant bimasse","de":"Zweimassenschwungrad","it":"Volano bimassa"}',null,210,'engine',false,'demo-motorvia'),
      ('embraiagem','Rolamento de embraiagem','{"es":"Cojinete de embrague","en":"Clutch release bearing","fr":"Butée d''embrayage","de":"Ausrücklager","it":"Cuscinetto reggispinta"}',null,30,'engine',false,'demo-motorvia'),
      ('eletrico','Alternador','{"es":"Alternador","en":"Alternator","fr":"Alternateur","de":"Lichtmaschine","it":"Alternatore"}',null,140,'engine',true,'demo-lumina'),
      ('eletrico','Motor de arranque','{"es":"Motor de arranque","en":"Starter motor","fr":"Démarreur","de":"Anlasser","it":"Motorino di avviamento"}',null,120,'engine',true,'demo-lumina'),
      ('eletrico','Bateria 12V 60Ah','{"es":"Batería 12V 60Ah","en":"Battery 12V 60Ah","fr":"Batterie 12V 60Ah","de":"Batterie 12V 60Ah","it":"Batteria 12V 60Ah"}',null,70,'universal',false,'demo-lumina'),
      ('eletrico','Sensor ABS dianteiro','{"es":"Sensor ABS delantero","en":"Front ABS sensor","fr":"Capteur ABS avant","de":"ABS-Sensor vorne","it":"Sensore ABS anteriore"}','Dianteiro',22,'model',false,'demo-lumina'),
      ('ar-condicionado','Compressor de ar condicionado','{"es":"Compresor de aire acondicionado","en":"A/C compressor","fr":"Compresseur de climatisation","de":"Klimakompressor","it":"Compressore aria condizionata"}',null,220,'engine',true,'demo-climax'),
      ('ar-condicionado','Condensador de ar condicionado','{"es":"Condensador de aire acondicionado","en":"A/C condenser","fr":"Condenseur de climatisation","de":"Klimakondensator","it":"Condensatore aria condizionata"}',null,75,'model',false,'demo-climax'),
      ('refrigeracao','Radiador do motor','{"es":"Radiador del motor","en":"Engine radiator","fr":"Radiateur moteur","de":"Motorkühler","it":"Radiatore motore"}',null,75,'engine',false,'demo-climax'),
      ('refrigeracao','Termóstato','{"es":"Termostato","en":"Thermostat","fr":"Thermostat","de":"Thermostat","it":"Termostato"}',null,15,'engine',false,'demo-climax'),
      ('refrigeracao','Ventilador do radiador','{"es":"Ventilador del radiador","en":"Radiator fan","fr":"Ventilateur de radiateur","de":"Kühlerlüfter","it":"Ventola radiatore"}',null,85,'model',true,'demo-climax'),
      ('direcao','Terminal de direção','{"es":"Rótula de dirección","en":"Tie rod end","fr":"Rotule de direction","de":"Spurstangenkopf","it":"Testina sterzo"}','Dianteiro',12,'model',false,'demo-flexa'),
      ('direcao','Rótula de suspensão','{"es":"Rótula de suspensión","en":"Ball joint","fr":"Rotule de suspension","de":"Traggelenk","it":"Giunto sferico"}','Dianteiro',14,'model',false,'demo-flexa'),
      ('direcao','Bomba de direção assistida','{"es":"Bomba de dirección asistida","en":"Power steering pump","fr":"Pompe de direction assistée","de":"Servopumpe","it":"Pompa servosterzo"}',null,110,'engine',true,'demo-flexa'),
      ('escape','Silenciador traseiro','{"es":"Silenciador trasero","en":"Rear silencer","fr":"Silencieux arrière","de":"Endschalldämpfer","it":"Silenziatore posteriore"}','Traseiro',55,'model',false,'demo-climax'),
      ('escape','Sonda lambda','{"es":"Sonda lambda","en":"Lambda sensor","fr":"Sonde lambda","de":"Lambdasonde","it":"Sonda lambda"}',null,45,'engine',false,'demo-climax'),
      ('consumiveis','Óleo de motor 5W-30 (5 L)','{"es":"Aceite de motor 5W-30 (5 L)","en":"Engine oil 5W-30 (5 L)","fr":"Huile moteur 5W-30 (5 L)","de":"Motoröl 5W-30 (5 L)","it":"Olio motore 5W-30 (5 L)"}',null,32,'universal',false,'demo-lubra'),
      ('consumiveis','Líquido de refrigeração (5 L)','{"es":"Líquido refrigerante (5 L)","en":"Coolant (5 L)","fr":"Liquide de refroidissement (5 L)","de":"Kühlmittel (5 L)","it":"Liquido refrigerante (5 L)"}',null,12,'universal',false,'demo-lubra'),
      ('consumiveis','Líquido de travões DOT 4 (1 L)','{"es":"Líquido de frenos DOT 4 (1 L)","en":"Brake fluid DOT 4 (1 L)","fr":"Liquide de frein DOT 4 (1 L)","de":"Bremsflüssigkeit DOT 4 (1 L)","it":"Liquido freni DOT 4 (1 L)"}',null,8,'universal',false,'demo-lubra'),
      ('consumiveis','Líquido limpa-vidros (5 L)','{"es":"Líquido limpiaparabrisas (5 L)","en":"Screen wash (5 L)","fr":"Lave-glace (5 L)","de":"Scheibenreiniger (5 L)","it":"Liquido lavavetri (5 L)"}',null,5,'universal',false,'demo-lubra'),
      ('acessorios','Jogo de tapetes de borracha','{"es":"Juego de alfombrillas de goma","en":"Rubber floor mat set","fr":"Jeu de tapis caoutchouc","de":"Gummifußmatten-Set","it":"Set tappetini in gomma"}',null,20,'model',false,'demo-carroz'),
      ('acessorios','Barras de tejadilho','{"es":"Barras de techo","en":"Roof bars","fr":"Barres de toit","de":"Dachträger","it":"Barre portatutto"}',null,75,'model',false,'demo-carroz'),
      ('acessorios','Triângulo de sinalização','{"es":"Triángulo de emergencia","en":"Warning triangle","fr":"Triangle de signalisation","de":"Warndreieck","it":"Triangolo di emergenza"}',null,6,'universal',false,'demo-carroz'),
      ('acessorios','Kit de primeiros socorros','{"es":"Botiquín de primeros auxilios","en":"First aid kit","fr":"Trousse de premiers secours","de":"Verbandkasten","it":"Kit pronto soccorso"}',null,9,'universal',false,'demo-carroz')
    ) as x(cat, name, i18n, pos, cost, scope, used, brand)
  loop
    select id into v_brand from public.brands where slug = t.brand;

    for m in
      select row_number() over (order by mk.name, md.name) as midx, mk.id as make_id, md.id as model_id,
             mk.name as make, md.name as model, md.year_from, md.year_to
      from public.vehicle_models md
      join public.vehicle_makes mk on mk.id = md.make_id
      where t.scope <> 'universal'
      union all
      select 0, null, null, null, null, null, null where t.scope = 'universal'
    loop
      -- About a third of the vehicles per part (deterministic), every vehicle for brakes / filters.
      continue when t.scope <> 'universal' and t.cat not in ('travagem', 'filtros') and (t.idx + m.midx) % 3 <> 0;
      v_n := v_n + 1;
      v_seed := (t.idx * 7919 + coalesce(m.midx, 0) * 104729) % 1000;
      v_cost := round(t.cost * (0.85 + (v_seed % 30) / 100.0), 2);
      v_ref := 'DM-' || upper(left(replace(t.cat, '-', ''), 3)) || '-' || lpad(v_n::text, 5, '0');

      insert into public.products (sku, name, name_i18n, description, brand_id, category_id, manufacturer, part_number,
                                   group_key, condition, price, currency, price_mode, availability, specs,
                                   data_source, is_demo)
      values (v_ref, t.name, t.i18n::jsonb,
              c_desc || case when m.make is not null then ' Exemplo para ' || m.make || ' ' || m.model || '.' else '' end,
              v_brand, (select id from public.part_categories where slug = t.cat), 'DEMO', v_ref,
              'DM-G-' || v_n, 'new', null, 'EUR', 'rules', 'on_request',
              case when t.pos is not null then jsonb_build_object('Posição', t.pos) else '{}'::jsonb end,
              'demo', true)
      on conflict (sku) do nothing
      returning id into v_product;
      continue when v_product is null;

      -- Compatibility: engine-specific parts go to the model's engine versions when it has them.
      if m.make_id is not null then
        if t.scope = 'engine' and exists (select 1 from public.vehicle_variants v where v.model_id = m.model_id) then
          insert into public.product_vehicle_compatibility (product_id, make_id, model_id, variant_id, year_from, year_to,
                                                            position, source, verified)
          select v_product, m.make_id, m.model_id, v.id, coalesce(v.year_from, m.year_from), coalesce(v.year_to, m.year_to),
                 t.pos, 'demo', false
          from public.vehicle_variants v
          where v.model_id = m.model_id
            and (v_seed % 2 = 0 or v.fuel = case when v_seed % 4 = 1 then 'diesel' else 'petrol' end)
          limit 2;
        else
          insert into public.product_vehicle_compatibility (product_id, make_id, model_id, year_from, year_to, position, source, verified)
          values (v_product, m.make_id, m.model_id, m.year_from, m.year_to, t.pos, 'demo', false);
        end if;
      end if;

      -- Internal offers (1–3 DEMO suppliers): different costs, stock and lead times.
      -- ~3 % without any cost → "sob consulta"; ~10 % without stock anywhere → "por encomenda".
      if v_seed % 33 = 0 then
        insert into public.supplier_products (supplier_id, product_id, supplier_sku, cost_price, stock_quantity,
                                              availability, lead_time_days, condition, last_synced_at)
        values (v_b, v_product, 'B-' || v_n, null, null, 'on_request', null, 'new', now());
      else
        insert into public.supplier_products (supplier_id, product_id, supplier_sku, cost_price, stock_quantity,
                                              availability, lead_time_days, condition, last_synced_at)
        values (v_a, v_product, 'A-' || v_n, v_cost,
                case when v_seed % 10 = 0 then 0 else v_seed % 3 end,
                (case when v_seed % 10 = 0 or v_seed % 3 = 0 then 'on_order' else 'in_stock' end)::public.product_availability,
                case when v_seed % 10 = 0 or v_seed % 3 = 0 then 3 else 1 end, 'new', now());
        if v_seed % 4 <> 0 then
          insert into public.supplier_products (supplier_id, product_id, supplier_sku, cost_price, stock_quantity,
                                                availability, lead_time_days, condition, last_synced_at)
          values (v_b, v_product, 'B-' || v_n, round(v_cost * 1.06, 2),
                  case when v_seed % 10 = 0 then 0 else 2 + v_seed % 7 end,
                  (case when v_seed % 10 = 0 then 'on_order' else 'in_stock' end)::public.product_availability, 2 + v_seed % 3, 'new', now());
        end if;
        if v_seed % 5 = 0 then
          insert into public.supplier_products (supplier_id, product_id, supplier_sku, cost_price, stock_quantity,
                                                availability, lead_time_days, condition, last_synced_at)
          values (v_c, v_product, 'C-' || v_n, round(v_cost * 1.12, 2),
                  case when v_seed % 10 = 0 then 0 else 5 + v_seed % 11 end,
                  (case when v_seed % 10 = 0 then 'on_order' else 'in_stock' end)::public.product_availability, case when v_seed % 10 = 0 then 7 else 4 end,
                  'new', now());
        end if;
      end if;

      -- Used version (same group key; manual price, supplier C only).
      if t.used and v_seed % 2 = 0 and m.make_id is not null then
        insert into public.products (sku, name, name_i18n, description, brand_id, category_id, manufacturer, part_number,
                                     group_key, condition, price, currency, price_mode, availability, specs,
                                     data_source, is_demo)
        values (v_ref || '-U', t.name, t.i18n::jsonb, c_desc || ' Peça usada testada (exemplo).', v_brand,
                (select id from public.part_categories where slug = t.cat), 'DEMO', v_ref,
                'DM-G-' || v_n, 'used', round(v_cost * 0.6 * 1.3, 2), 'EUR', 'manual', 'on_request',
                case when t.pos is not null then jsonb_build_object('Posição', t.pos) else '{}'::jsonb end,
                'demo', true)
        on conflict (sku) do nothing
        returning id into v_used;
        if v_used is not null then
          insert into public.product_vehicle_compatibility (product_id, make_id, model_id, year_from, year_to, position, source, verified)
          values (v_used, m.make_id, m.model_id, m.year_from, m.year_to, t.pos, 'demo', false);
          insert into public.supplier_products (supplier_id, product_id, supplier_sku, cost_price, stock_quantity,
                                                availability, lead_time_days, condition, last_synced_at)
          values (v_c, v_used, 'C-U-' || v_n, round(v_cost * 0.6, 2), 1, 'in_stock', 2, 'used', now());
        end if;
      end if;
    end loop;
  end loop;

  perform set_config('eurocargo.skip_search_refresh', 'off', true);
  perform set_config('eurocargo.skip_offer_refresh', 'off', true);
  for v_product in select p.id from public.products p where p.is_demo and p.sku like 'DM-%' loop
    perform public.catalog_refresh_offers(v_product);
  end loop;
  update public.products set search_text = search_text where is_demo and sku like 'DM-%';
end;
$$;

commit;
