CREATE TABLE seedling_purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE RESTRICT,
  purchase_date TEXT NOT NULL,
  crop_type_id INTEGER NOT NULL REFERENCES crop_types(id) ON DELETE RESTRICT,
  crop_variety_id INTEGER NOT NULL REFERENCES crop_varieties(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost REAL NOT NULL CHECK (unit_cost >= 0),
  total_cost REAL NOT NULL CHECK (total_cost >= 0),
  supplier TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_seedling_purchases_season ON seedling_purchases(season_id);
CREATE INDEX idx_seedling_purchases_date ON seedling_purchases(purchase_date);
