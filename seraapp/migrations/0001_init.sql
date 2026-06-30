-- Tek satırlık yapılandırma (parola hash vb.)
CREATE TABLE app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Sezonlar
CREATE TABLE seasons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,        -- 'YYYY-MM-DD'
  end_date TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0,
  partner_share_pct REAL NOT NULL DEFAULT 25,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Tek bir aktif sezon zorunluluğu (unique partial index)
CREATE UNIQUE INDEX idx_seasons_only_one_active ON seasons(is_active) WHERE is_active = 1;
