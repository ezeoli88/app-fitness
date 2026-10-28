-- Ejercicio marcado como opcional en una sesión: sus series no cuentan para completarla.
ALTER TABLE session_exercises ADD COLUMN optional INTEGER NOT NULL DEFAULT 0
  CHECK (optional IN (0, 1));
