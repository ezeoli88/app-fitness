-- Análisis de sangre: Claude lee el estudio en el chat y guarda todos los valores por el conector MCP.
-- `key` es una clave estable en snake_case para seguir el mismo valor entre estudios de distintos laboratorios.
CREATE TABLE lab_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  day TEXT NOT NULL,
  lab TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_lab_reports_day ON lab_reports (day);

CREATE TABLE lab_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  report_id INTEGER NOT NULL REFERENCES lab_reports (id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  value REAL,
  value_text TEXT,
  unit TEXT,
  ref_low REAL,
  ref_high REAL,
  ref_text TEXT,
  CHECK (value IS NOT NULL OR value_text IS NOT NULL)
);
CREATE INDEX idx_lab_results_report ON lab_results (report_id);
CREATE INDEX idx_lab_results_key ON lab_results (key);
