CREATE TABLE sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE RESTRICT,
  sale_date TEXT NOT NULL,
  crop_type_id INTEGER NOT NULL REFERENCES crop_types(id) ON DELETE RESTRICT,
  crop_variety_id INTEGER NOT NULL REFERENCES crop_varieties(id) ON DELETE RESTRICT,
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit_price REAL NOT NULL CHECK (unit_price >= 0),
  total_revenue REAL NOT NULL CHECK (total_revenue >= 0),
  unit_cost REAL,
  total_cost REAL,
  buyer TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sales_season ON sales(season_id);
CREATE INDEX idx_sales_date ON sales(sale_date);

CREATE TABLE market_price_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_date TEXT NOT NULL,
  crop_type_id INTEGER NOT NULL REFERENCES crop_types(id) ON DELETE RESTRICT,
  crop_variety_id INTEGER NOT NULL REFERENCES crop_varieties(id) ON DELETE RESTRICT,
  market_price REAL NOT NULL CHECK (market_price >= 0),
  source TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_market_prices_date ON market_price_snapshots(snapshot_date);
CREATE INDEX idx_market_prices_type ON market_price_snapshots(crop_type_id);
