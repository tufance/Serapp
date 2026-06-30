CREATE TABLE partner_payouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE RESTRICT,
  payout_date TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount >= 0),
  method TEXT NOT NULL CHECK (method IN ('nakit','havale','diğer')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_payouts_season ON partner_payouts(season_id);
CREATE INDEX idx_payouts_date ON partner_payouts(payout_date);
