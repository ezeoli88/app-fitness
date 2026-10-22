-- Peso objetivo opcional por ejercicio, en kilogramos.
ALTER TABLE exercises ADD COLUMN target_weight_kg REAL NULL
  CHECK (target_weight_kg IS NULL OR target_weight_kg >= 0);
