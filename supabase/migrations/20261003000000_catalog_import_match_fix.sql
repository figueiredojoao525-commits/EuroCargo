-- ════════════════════════════════════════════════════════════════════
-- EuroCargo — catalogue import fix (after 20261002000000_catalog_scale_import).
--
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
