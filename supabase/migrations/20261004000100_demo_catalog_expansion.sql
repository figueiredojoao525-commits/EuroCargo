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
