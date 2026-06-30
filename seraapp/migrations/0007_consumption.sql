CREATE TABLE consumption_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE RESTRICT,
  period_month TEXT NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('supply','utility')),
  ref_id INTEGER NOT NULL,
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL,
  unit_cost REAL,
  total_cost REAL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_consumption_season ON consumption_records(season_id);
CREATE INDEX idx_consumption_month ON consumption_records(period_month);
CREATE INDEX idx_consumption_ref ON consumption_records(item_type, ref_id);

CREATE TRIGGER trg_consumption_supply_insert
AFTER INSERT ON consumption_records
WHEN NEW.item_type='supply'
BEGIN
  INSERT INTO supply_stock_movements (supply_category_id, movement_date, delta_qty, source_type, source_id)
  VALUES (NEW.ref_id, NEW.period_month || '-01', -NEW.quantity, 'consumption', NEW.id);
END;

CREATE TRIGGER trg_consumption_supply_update
AFTER UPDATE ON consumption_records
WHEN NEW.item_type='supply'
BEGIN
  UPDATE supply_stock_movements
  SET supply_category_id = NEW.ref_id,
      movement_date      = NEW.period_month || '-01',
      delta_qty          = -NEW.quantity
  WHERE source_type='consumption' AND source_id=NEW.id;
END;

CREATE TRIGGER trg_consumption_supply_delete
AFTER DELETE ON consumption_records
WHEN OLD.item_type='supply'
BEGIN
  DELETE FROM supply_stock_movements
  WHERE source_type='consumption' AND source_id=OLD.id;
END;
