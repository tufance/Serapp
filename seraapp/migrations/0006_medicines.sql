CREATE TABLE medicine_purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE RESTRICT,
  purchase_date TEXT NOT NULL,
  medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE RESTRICT,
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL,
  unit_cost REAL NOT NULL CHECK (unit_cost >= 0),
  total_cost REAL NOT NULL CHECK (total_cost >= 0),
  supplier TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_medicine_purchases_season ON medicine_purchases(season_id);
CREATE INDEX idx_medicine_purchases_med ON medicine_purchases(medicine_id);

CREATE TABLE medicine_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE RESTRICT,
  application_date TEXT NOT NULL,
  medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE RESTRICT,
  disease_id INTEGER NOT NULL REFERENCES diseases(id) ON DELETE RESTRICT,
  quantity_used REAL NOT NULL CHECK (quantity_used > 0),
  target TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_medicine_apps_season ON medicine_applications(season_id);
CREATE INDEX idx_medicine_apps_med ON medicine_applications(medicine_id);

CREATE TABLE medicine_stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  movement_date TEXT NOT NULL,
  delta_qty REAL NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('purchase','application','adjustment')),
  source_id INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_medicine_stock_med ON medicine_stock_movements(medicine_id);
CREATE INDEX idx_medicine_stock_source ON medicine_stock_movements(source_type, source_id);

CREATE TRIGGER trg_medicine_purchase_insert
AFTER INSERT ON medicine_purchases
BEGIN
  INSERT INTO medicine_stock_movements (medicine_id, movement_date, delta_qty, source_type, source_id)
  VALUES (NEW.medicine_id, NEW.purchase_date, NEW.quantity, 'purchase', NEW.id);
END;

CREATE TRIGGER trg_medicine_purchase_update
AFTER UPDATE ON medicine_purchases
BEGIN
  UPDATE medicine_stock_movements
  SET medicine_id   = NEW.medicine_id,
      movement_date = NEW.purchase_date,
      delta_qty     = NEW.quantity
  WHERE source_type='purchase' AND source_id=NEW.id;
END;

CREATE TRIGGER trg_medicine_purchase_delete
AFTER DELETE ON medicine_purchases
BEGIN
  DELETE FROM medicine_stock_movements
  WHERE source_type='purchase' AND source_id=OLD.id;
END;

CREATE TRIGGER trg_medicine_application_insert
AFTER INSERT ON medicine_applications
BEGIN
  INSERT INTO medicine_stock_movements (medicine_id, movement_date, delta_qty, source_type, source_id)
  VALUES (NEW.medicine_id, NEW.application_date, -NEW.quantity_used, 'application', NEW.id);
END;

CREATE TRIGGER trg_medicine_application_update
AFTER UPDATE ON medicine_applications
BEGIN
  UPDATE medicine_stock_movements
  SET medicine_id   = NEW.medicine_id,
      movement_date = NEW.application_date,
      delta_qty     = -NEW.quantity_used
  WHERE source_type='application' AND source_id=NEW.id;
END;

CREATE TRIGGER trg_medicine_application_delete
AFTER DELETE ON medicine_applications
BEGIN
  DELETE FROM medicine_stock_movements
  WHERE source_type='application' AND source_id=OLD.id;
END;
