-- Esquema final de la web. Android sigue su migración incremental y no ejecuta este archivo.
PRAGMA foreign_keys = ON;

CREATE TABLE routines (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  level TEXT NOT NULL,
  sort INTEGER NOT NULL,
  archived_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  rev INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE days (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  uid TEXT,
  routine_id TEXT NOT NULL REFERENCES routines (id),
  title TEXT NOT NULL,
  sort INTEGER NOT NULL,
  archived_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  rev INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX ux_days_uid ON days (uid) WHERE uid IS NOT NULL;

CREATE TABLE exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  uid TEXT,
  day_id INTEGER NOT NULL REFERENCES days (id),
  name TEXT NOT NULL,
  sets INTEGER NOT NULL CHECK (sets >= 1),
  reps INTEGER NOT NULL CHECK (reps >= 1),
  sort INTEGER NOT NULL,
  archived_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  rev INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX ux_exercises_uid ON exercises (uid) WHERE uid IS NOT NULL;

CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  uid TEXT,
  day_id INTEGER NOT NULL REFERENCES days (id),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  completed_sets TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed', 'partial')),
  routine_id TEXT NOT NULL,
  routine_title TEXT NOT NULL,
  day_title TEXT NOT NULL,
  last_used_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  rev INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX ux_sessions_uid ON sessions (uid) WHERE uid IS NOT NULL;
CREATE INDEX idx_sessions_day_open ON sessions (day_id, completed_at);
CREATE INDEX idx_sessions_routine_done ON sessions (routine_id, status, completed_at);
CREATE UNIQUE INDEX ux_sessions_one_open_per_day ON sessions (day_id) WHERE status = 'open';

CREATE TABLE session_exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  uid TEXT,
  session_id INTEGER NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  source_exercise_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  sets INTEGER NOT NULL CHECK (sets >= 1),
  reps INTEGER NOT NULL CHECK (reps >= 1),
  sort INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  rev INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX ux_session_exercises_uid ON session_exercises (uid) WHERE uid IS NOT NULL;
CREATE INDEX idx_session_exercises_session ON session_exercises (session_id, sort);

CREATE TABLE session_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  uid TEXT,
  session_exercise_id INTEGER NOT NULL REFERENCES session_exercises (id) ON DELETE CASCADE,
  set_index INTEGER NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  weight_kg REAL CHECK (weight_kg IS NULL OR weight_kg >= 0),
  actual_reps INTEGER CHECK (actual_reps IS NULL OR actual_reps >= 1),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  rev INTEGER NOT NULL DEFAULT 0,
  UNIQUE (session_exercise_id, set_index)
);
CREATE UNIQUE INDEX ux_session_sets_uid ON session_sets (uid) WHERE uid IS NOT NULL;
CREATE INDEX idx_session_sets_exercise ON session_sets (session_exercise_id, set_index);

CREATE TABLE settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  rev INTEGER NOT NULL DEFAULT 0
);
