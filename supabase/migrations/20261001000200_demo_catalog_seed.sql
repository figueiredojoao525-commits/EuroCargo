-- ════════════════════════════════════════════════════════════════════
-- EuroCargo — starter reference data + DEMO catalogue
--
-- Reference data (kept): part categories (6 languages) and a few vehicle
-- makes/models with their public production years.
--
-- DEMO data (is_demo = true, brand "DEMO Parts", supplier "Fornecedor DEMO"):
-- fictitious products and prices ONLY to exercise the shop, the assistant and
-- the pricing rules. They are not offers, have no OE references and no images.
-- The UI labels them as demonstration. Remove them all with:
--   select public.admin_purge_demo_data();   -- as an admin
-- ════════════════════════════════════════════════════════════════════

insert into public.part_categories (slug, name, name_i18n, icon, position) values
  ('iluminacao',   'Iluminação',        '{"es":"Iluminación","en":"Lighting","fr":"Éclairage","de":"Beleuchtung","it":"Illuminazione"}', 'bulb', 10),
  ('travagem',     'Travagem',          '{"es":"Frenos","en":"Brakes","fr":"Freinage","de":"Bremsen","it":"Freni"}', 'brake', 20),
  ('motor',        'Motor',             '{"es":"Motor","en":"Engine","fr":"Moteur","de":"Motor","it":"Motore"}', 'engine', 30),
  ('suspensao',    'Suspensão',         '{"es":"Suspensión","en":"Suspension","fr":"Suspension","de":"Fahrwerk","it":"Sospensioni"}', 'suspension', 40),
  ('filtros',      'Filtros',           '{"es":"Filtros","en":"Filters","fr":"Filtres","de":"Filter","it":"Filtri"}', 'filter', 50),
  ('carrocaria',   'Carroçaria',        '{"es":"Carrocería","en":"Bodywork","fr":"Carrosserie","de":"Karosserie","it":"Carrozzeria"}', 'car', 60),
  ('eletrico',     'Sistema elétrico',  '{"es":"Sistema eléctrico","en":"Electrical","fr":"Électricité","de":"Elektrik","it":"Impianto elettrico"}', 'bolt', 70),
  ('refrigeracao', 'Refrigeração',      '{"es":"Refrigeración","en":"Cooling","fr":"Refroidissement","de":"Kühlung","it":"Raffreddamento"}', 'cooling', 80)
on conflict (slug) do nothing;

insert into public.vehicle_makes (name, slug) values
  ('Peugeot', 'peugeot'), ('Volkswagen', 'volkswagen'), ('Renault', 'renault'), ('SEAT', 'seat'), ('BMW', 'bmw')
on conflict (slug) do nothing;

insert into public.vehicle_models (make_id, name, slug, body_type, year_from, year_to)
select m.id, v.name, v.slug, v.body, v.y1, v.y2
from (values
  ('peugeot',    '307 SW',          '307-sw',  'Estate',    2002, 2008),
  ('volkswagen', 'Golf V',          'golf-v',  'Hatchback', 2003, 2009),
  ('renault',    'Clio III',        'clio-iii','Hatchback', 2005, 2014),
  ('seat',       'Ibiza (6J)',      'ibiza-6j','Hatchback', 2008, 2017),
  ('bmw',        'Série 3 (E90)',   '3-e90',   'Sedan',     2005, 2011)
) as v(make, name, slug, body, y1, y2)
join public.vehicle_makes m on m.slug = v.make
on conflict (make_id, slug) do nothing;

do $$
declare
  v_brand    uuid;
  v_supplier uuid;
  v_used_hl  uuid;
  v_p        uuid;
  v_desc     constant text := 'Produto de demonstração para testar a loja — não é uma oferta real.';
  r          record;
begin
  insert into public.brands (name, slug, is_demo) values ('DEMO Parts', 'demo-parts', true)
  on conflict (slug) do update set is_demo = true
  returning id into v_brand;

  insert into public.suppliers (name, country, notes, is_demo)
  values ('Fornecedor DEMO', 'PT', 'Fornecedor fictício para demonstração.', true)
  returning id into v_supplier;

  for r in
    select * from (values
      ('DEMO-307-HL-L-N', 'Ótica dianteira esquerda',
       '{"es":"Faro delantero izquierdo","en":"Front left headlight","fr":"Phare avant gauche","de":"Scheinwerfer vorne links","it":"Faro anteriore sinistro"}',
       'iluminacao', 'new'::public.part_condition, 120.00, 'in_stock'::public.product_availability, 2, null::smallint,
       'DEMO307HLLEFT', 'peugeot', '307-sw', 2002, 2008, 'Dianteira esquerda'),
      ('DEMO-307-HL-L-U', 'Ótica dianteira esquerda',
       '{"es":"Faro delantero izquierdo","en":"Front left headlight","fr":"Phare avant gauche","de":"Scheinwerfer vorne links","it":"Faro anteriore sinistro"}',
       'iluminacao', 'used', 65.00, 'in_stock', 1, null,
       'DEMO307HLLEFT', 'peugeot', '307-sw', 2002, 2008, 'Dianteira esquerda'),
      ('DEMO-307-HL-R-N', 'Ótica dianteira direita',
       '{"es":"Faro delantero derecho","en":"Front right headlight","fr":"Phare avant droit","de":"Scheinwerfer vorne rechts","it":"Faro anteriore destro"}',
       'iluminacao', 'new', 120.00, 'on_order', null, 3,
       'DEMO307HLRIGHT', 'peugeot', '307-sw', 2002, 2008, 'Dianteira direita'),
      ('DEMO-GOLF5-BP-F', 'Pastilhas de travão dianteiras',
       '{"es":"Pastillas de freno delanteras","en":"Front brake pads","fr":"Plaquettes de frein avant","de":"Bremsbeläge vorne","it":"Pastiglie freno anteriori"}',
       'travagem', 'new', 34.90, 'in_stock', 6, null,
       'DEMOGOLF5BPF', 'volkswagen', 'golf-v', 2003, 2009, 'Eixo dianteiro'),
      ('DEMO-GOLF5-BD-F', 'Disco de travão dianteiro',
       '{"es":"Disco de freno delantero","en":"Front brake disc","fr":"Disque de frein avant","de":"Bremsscheibe vorne","it":"Disco freno anteriore"}',
       'travagem', 'new', 49.90, 'in_stock', 4, null,
       'DEMOGOLF5BDF', 'volkswagen', 'golf-v', 2003, 2009, 'Eixo dianteiro'),
      ('DEMO-CLIO3-OF', 'Filtro de óleo',
       '{"es":"Filtro de aceite","en":"Oil filter","fr":"Filtre à huile","de":"Ölfilter","it":"Filtro olio"}',
       'filtros', 'new', 8.50, 'in_stock', 12, null,
       'DEMOCLIO3OF', 'renault', 'clio-iii', 2005, 2014, null),
      ('DEMO-IBIZA6J-SA-R', 'Amortecedor traseiro',
       '{"es":"Amortiguador trasero","en":"Rear shock absorber","fr":"Amortisseur arrière","de":"Stoßdämpfer hinten","it":"Ammortizzatore posteriore"}',
       'suspensao', 'used', 29.00, 'in_stock', 2, null,
       'DEMOIBIZA6JSAR', 'seat', 'ibiza-6j', 2008, 2017, 'Traseira'),
      ('DEMO-E90-ALT', 'Alternador',
       '{"es":"Alternador","en":"Alternator","fr":"Alternateur","de":"Lichtmaschine","it":"Alternatore"}',
       'eletrico', 'used', null, 'on_request', null, 5,
       'DEMOE90ALT', 'bmw', '3-e90', 2005, 2011, null)
    ) as x(part_number, name, name_i18n, category, cond, price, avail, stock, lead, grp, make, model, y1, y2, pos)
  loop
    insert into public.products (sku, name, name_i18n, description, brand_id, category_id, manufacturer,
                                 part_number, group_key, condition, price, currency, price_mode,
                                 availability, stock_quantity, lead_time_days, data_source, is_demo)
    values (r.part_number, r.name, r.name_i18n::jsonb, v_desc, v_brand,
            (select id from public.part_categories where slug = r.category), 'DEMO Parts',
            r.part_number, r.grp, r.cond, r.price, 'EUR',
            case when r.part_number = 'DEMO-307-HL-L-U' then 'rules' else 'manual' end,
            r.avail, r.stock, r.lead, 'demo', true)
    returning id into v_p;

    insert into public.product_vehicle_compatibility (product_id, make_id, model_id, year_from, year_to, position, source, verified)
    select v_p, mk.id, md.id, r.y1, r.y2, r.pos, 'demo', false
    from public.vehicle_makes mk join public.vehicle_models md on md.make_id = mk.id and md.slug = r.model
    where mk.slug = r.make;

    if r.part_number = 'DEMO-307-HL-L-U' then
      v_used_hl := v_p;
    end if;
  end loop;

  -- Pricing example: supplier cost €50 + 30 % margin for used parts = public price €65.
  insert into public.supplier_products (supplier_id, product_id, supplier_sku, cost_price, currency, stock_quantity,
                                        condition, availability, last_synced_at)
  values (v_supplier, v_used_hl, 'FD-307-HLL-U', 50.00, 'EUR', 1, 'used', 'in_stock', now());

  insert into public.price_rules (name, scope, condition, margin_percent, priority, is_demo)
  values ('DEMO — margem peças usadas 30%', 'condition', 'used', 30, 0, true);
end;
$$;
