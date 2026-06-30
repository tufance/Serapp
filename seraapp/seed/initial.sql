-- Ürün türleri
INSERT INTO crop_types (name) VALUES
  ('domates'), ('salatalık'), ('biber'), ('patlıcan');

-- Birkaç cins (örnek)
INSERT INTO crop_varieties (crop_type_id, name)
SELECT id, 'standart' FROM crop_types;

-- Sarf malzeme kategorileri
INSERT INTO supply_categories (name, unit) VALUES
  ('naylon', 'm2'),
  ('odun', 'kg'),
  ('kömür', 'kg'),
  ('gübre', 'kg');

-- Tüketim (stoksuz) kalemleri
INSERT INTO utility_types (name, unit) VALUES
  ('elektrik', 'kWh'),
  ('su', 'm3');

-- Bazı hastalıklar
INSERT INTO diseases (name) VALUES
  ('mildiyö'),
  ('külleme'),
  ('yaprak biti');
