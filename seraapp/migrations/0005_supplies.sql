CREATE TABLE supply_purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE RESTRICT,
  purchase_date TEXT NOT NULL,
  supply_category_id INTEGER NOT NULL REFERENCES supply_categories(id) ON DELETE RESTRICT,
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL,
  unit_cost REAL NOT NULL CHECK (unit_cost >= 0),
  total_cost REAL NOT NULL CHECK (total_cost >= 0),
  supplier TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_supply_purchases_season ON supply_purchases(season_id);
CREATE INDEX idx_supply_purchases_cat ON supply_purchases(supply_category_id);

CREATE TABLE supply_stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supply_category_id INTEGER NOT NULL REFERENCES supply_categories(id) ON DELETE CASCADE,
  movement_date TEXT NOT NULL,
  delta_qty REAL NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('purchase','consumption','adjustment')),
  source_id INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_supply_stock_cat ON supply_stock_movements(supply_category_id);
CREATE INDEX idx_supply_stock_source ON supply_stock_movements(source_type, source_id);

CREATE TRIGGER trg_supply_purchase_insert
AFTER INSERT ON supply_purchases
BEGIN
  INSERT INTO supply_stock_movements (supply_category_id, movement_date, delta_qty, source_type, source_id)
  VALUES (NEW.supply_category_id, NEW.purchase_date, NEW.quantity, 'purchase', NEW.id);
END;

CREATE TRIGGER trg_supply_purchase_update
AFTER UPDATE ON supply_purchases
BEGIN
  UPDATE supply_stock_movements
  SET supply_category_id = NEW.supply_category_id,
      movement_date      = NEW.purchase_date,
      delta_qty          = NEW.quantity
  WHERE source_type='purchase' AND source_id=NEW.id;
END;

CREATE TRIGGER trg_supply_purchase_delete
AFTER DELETE ON supply_purchases
BEGIN
  DELETE FROM supply_stock_movements
  WHERE source_type='purchase' AND source_id=OLD.id;
END;
