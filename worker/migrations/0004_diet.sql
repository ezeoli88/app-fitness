-- Dieta: platos juzgados desde el chat (conector MCP) y medidas de cintura.
-- `day` es la fecha local (America/Argentina/Buenos_Aires) para agrupar sin cálculos de zona en SQL.
CREATE TABLE meals (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  eaten_at TEXT NOT NULL,
  day TEXT NOT NULL,
  title TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('ok', 'a_bit_much', 'too_much')),
  protein TEXT NOT NULL CHECK (protein IN ('enough', 'low')),
  carbs TEXT NOT NULL CHECK (carbs IN ('ok', 'high')),
  note TEXT
);
CREATE INDEX idx_meals_day ON meals (day, eaten_at);

CREATE TABLE waist_measurements (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  day TEXT NOT NULL,
  cm REAL NOT NULL CHECK (cm > 0)
);
CREATE INDEX idx_waist_day ON waist_measurements (day);
