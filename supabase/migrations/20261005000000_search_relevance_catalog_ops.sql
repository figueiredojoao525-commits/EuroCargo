-- ════════════════════════════════════════════════════════════════════
-- EuroCargo — search relevance and catalogue operations
--
-- * catalog_search(): same parameters and item shape, better ranking:
--     1. exact part number / EAN, 2. OE / cross reference, 3. every query term,
--     4. terms in the part NAME (not only in category / vehicles), 5. vehicle specificity
--     (exact engine > model > make-wide), then price. Each item says how it matched
--     ("reference" | "oe" | "exact" | "partial" | "listing") and the result carries
--     exact_total, so the shop separates exact results from approximate ones.
-- * Imports: option "deactivate_missing" — products of the batch's source that are not in a
--   complete feed are deactivated (never deleted; DEMO never touched).
-- * admin_set_demo_visibility(): hide / show the whole DEMO catalogue without deleting it.
-- Incremental and non-destructive. Requires 20261004000000.
-- ════════════════════════════════════════════════════════════════════

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
  v_name_expr text;
  v_vehicle_rank text;
  v_filter    text;
  v_from      text;
  v_total     integer;
  v_exact     integer;
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

  -- How many query terms appear in the product NAME itself (any language): "pastilhas" in the name ranks
  -- above products that only mention it through their category or vehicles.
  v_vehicle_rank := case when v_make is null then '0' else $v$
    coalesce((select min(case when $7::uuid is not null and c.variant_id = $7 then 1
                              when c.variant_id is not null then 2
                              when $6::uuid is not null and c.model_id = $6 then 2
                              when c.model_id is not null then 3
                              else 4 end)
              from public.product_vehicle_compatibility c
              where c.product_id = p.id and c.make_id = $5), 9) $v$ end;
  v_name_expr := '0';
  if cardinality(v_terms) > 0 then
    select string_agg(format('(case when public.normalize_search(p.name || '' '' || coalesce((select string_agg(value, '' '') from jsonb_each_text(p.name_i18n)), '''')) ~ %L then 1 else 0 end)',
                             '(' || g.pats || ')'), ' + ')
      into v_name_expr
    from (
      select x.idx, string_agg(regexp_replace(x.pat, '([.*+?^${}()|\[\]\\])', '\\\1', 'g'), '|') as pats
      from unnest(v_patterns, v_pat_idx) as x(pat, idx)
      group by x.idx
    ) g;
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
          select r.product_id as id,
                 min(case when r.kind in ('part_number', 'ean') then 1 else 2 end) as ref_rank
          from public.product_references r
          where ($14 <> '' and r.reference_norm = $14)
             or ($15 <> '' and r.reference_norm = $15 and r.kind in ('oe', 'cross'))
          group by r.product_id
        ),
        hits as (
          select id, max(matched_terms) as matched_terms, min(ref_rank) as ref_rank
          from (select id, matched_terms, 9 as ref_rank from term_hits
                union all select id, 0, ref_rank from ref_hits) u
          group by id
        ),
        filtered as materialized (
          select p.id, p.name, p.price, h.matched_terms, h.ref_rank < 9 as ref_match, h.ref_rank,
                 ($q$ || v_name_expr || $q$)::integer as name_hits,
                 $q$ || v_vehicle_rank || $q$ as vehicle_rank
          from hits h join public.products p on p.id = h.id
          where $q$ || v_filter || $q$
        )
      $q$;
    else
      v_from := $q$
        with filtered as materialized (
          select p.id, p.name, p.price, 0 as matched_terms, false as ref_match, 9 as ref_rank, 0 as name_hits,
                 $q$ || v_vehicle_rank || $q$ as vehicle_rank
          from public.products p
          where $q$ || v_filter || $q$
        )
      $q$;
    end if;

    execute v_from || $q$
      select (select count(*) from (select 1 from filtered limit $16) c)::integer,
             (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'm', f.matched_terms, 'r', f.ref_match,
                                                           'k', f.ref_rank, 'n', f.name_hits, 'v', f.vehicle_rank)
                                        order by f.ord), '[]'::jsonb)
                from (select *, row_number() over (order by ref_rank, matched_terms desc, name_hits desc,
                                                            vehicle_rank, (price is null), price, name) as ord
                      from filtered
                      order by ord
                      limit $17 offset $18) f),
             (select count(*) from (select 1 from filtered
                                    where ref_match or ($19 > 0 and matched_terms = $19) limit $16) e)::integer
    $q$
    into v_total, v_page, v_exact
    using v_category, v_condition, v_brand, v_avail, v_make, v_model, v_variant, v_year, v_fuel, v_cc, v_engine,
          v_patterns, v_pat_idx, v_ref, v_oe, c_cap, v_limit, v_offset, cardinality(v_terms);

    exit when v_total > 0;
  end loop;
  -- Without text, every result is a direct listing (filters only).
  if not v_has_text then
    v_exact := v_total;
  end if;

  select jsonb_build_object(
    'total', v_total,
    'total_capped', v_total >= c_cap,
    -- Results that match every term or a reference: the rest are approximate (shown as such).
    'exact_total', coalesce(v_exact, 0),
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
      'ref_match', (pg.value ->> 'r')::boolean,
      -- reference (part number / EAN) | oe (OE / cross reference) | exact (every term) | partial | listing
      'match', case
        when (pg.value ->> 'k')::integer = 1 then 'reference'
        when (pg.value ->> 'k')::integer = 2 then 'oe'
        when not v_has_text then 'listing'
        when cardinality(v_terms) > 0 and (pg.value ->> 'm')::integer = cardinality(v_terms) then 'exact'
        else 'partial' end
    ) order by pg.ordinality), '[]'::jsonb)
  ) into v_result
  from jsonb_array_elements(v_page) with ordinality pg
  join public.products p on p.id = (pg.value ->> 'id')::uuid;

  return v_result;
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
  v_batch       public.catalog_import_batches;
  v_status      text;
  v_deactivated integer;
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

  -- Complete feed: products of this source not seen in the batch are deactivated (not deleted).
  if not p_cancelled and v_status <> 'failed' and coalesce((v_batch.options ->> 'deactivate_missing')::boolean, false) then
    update public.products p set active = false
    where p.data_source = v_batch.data_source and p.active and not p.is_demo
      and (p.last_synced_at is null or p.last_synced_at < v_batch.started_at);
    get diagnostics v_deactivated = row_count;
    update public.supplier_products sp set active = false
    from public.catalog_sources s
    where s.id = v_batch.source_id and s.supplier_id is not null and sp.supplier_id = s.supplier_id and sp.active
      and (sp.last_synced_at is null or sp.last_synced_at < v_batch.started_at);
  end if;

  update public.catalog_import_batches set status = v_status, finished_at = now(),
    options = options || jsonb_build_object('deactivated', coalesce(v_deactivated, 0))
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
                             'skipped', v_batch.skipped, 'failed', v_batch.failed,
                             'deactivated', coalesce(v_deactivated, 0)));
  return to_jsonb(v_batch);
end;
$$;

-- Hide / show the whole DEMO catalogue (products stay in the database; purge deletes them).
create or replace function public.admin_set_demo_visibility(p_visible boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.products set active = p_visible where is_demo and active is distinct from p_visible;
  get diagnostics v_count = row_count;
  insert into public.admin_actions (admin_user_id, action, entity_type, details)
  values (auth.uid(), case when p_visible then 'demo_shown' else 'demo_hidden' end, 'catalog',
          jsonb_build_object('products', v_count));
  return jsonb_build_object('products', v_count, 'visible', p_visible);
end;
$$;

revoke execute on function public.admin_set_demo_visibility(boolean) from public, anon, authenticated;
grant execute on function public.admin_set_demo_visibility(boolean) to authenticated;
