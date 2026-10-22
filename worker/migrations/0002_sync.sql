-- Metadatos de sincronización. Los triggers suben `rev` una sola vez por escritura.
CREATE TABLE sync_meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE tombstones (
  table_name TEXT NOT NULL,
  uid TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (table_name, uid)
);

CREATE TRIGGER routines_rev_insert AFTER INSERT ON routines
BEGIN
  UPDATE routines SET rev = rev + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = NEW.id AND rev = NEW.rev;
END;

CREATE TRIGGER routines_rev_update AFTER UPDATE ON routines
WHEN NEW.rev = OLD.rev
BEGIN
  UPDATE routines SET rev = rev + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = NEW.id;
END;

CREATE TRIGGER days_rev_insert AFTER INSERT ON days
BEGIN
  UPDATE days SET rev = rev + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = NEW.id AND rev = NEW.rev;
END;

CREATE TRIGGER days_rev_update AFTER UPDATE ON days
WHEN NEW.rev = OLD.rev
BEGIN
  UPDATE days SET rev = rev + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = NEW.id;
END;

CREATE TRIGGER exercises_rev_insert AFTER INSERT ON exercises
BEGIN
  UPDATE exercises SET rev = rev + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = NEW.id AND rev = NEW.rev;
END;

CREATE TRIGGER exercises_rev_update AFTER UPDATE ON exercises
WHEN NEW.rev = OLD.rev
BEGIN
  UPDATE exercises SET rev = rev + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = NEW.id;
END;

CREATE TRIGGER sessions_rev_insert AFTER INSERT ON sessions
BEGIN
  UPDATE sessions SET rev = rev + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = NEW.id AND rev = NEW.rev;
END;

CREATE TRIGGER sessions_rev_update AFTER UPDATE ON sessions
WHEN NEW.rev = OLD.rev
BEGIN
  UPDATE sessions SET rev = rev + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = NEW.id;
END;

CREATE TRIGGER session_exercises_rev_insert AFTER INSERT ON session_exercises
BEGIN
  UPDATE session_exercises SET rev = rev + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = NEW.id AND rev = NEW.rev;
END;

CREATE TRIGGER session_exercises_rev_update AFTER UPDATE ON session_exercises
WHEN NEW.rev = OLD.rev
BEGIN
  UPDATE session_exercises SET rev = rev + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = NEW.id;
END;

CREATE TRIGGER session_sets_rev_insert AFTER INSERT ON session_sets
BEGIN
  UPDATE session_sets SET rev = rev + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = NEW.id AND rev = NEW.rev;
END;

CREATE TRIGGER session_sets_rev_update AFTER UPDATE ON session_sets
WHEN NEW.rev = OLD.rev
BEGIN
  UPDATE session_sets SET rev = rev + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = NEW.id;
END;

CREATE TRIGGER settings_rev_insert AFTER INSERT ON settings
BEGIN
  UPDATE settings SET rev = rev + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE key = NEW.key AND rev = NEW.rev;
END;

CREATE TRIGGER settings_rev_update AFTER UPDATE ON settings
WHEN NEW.rev = OLD.rev
BEGIN
  UPDATE settings SET rev = rev + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE key = NEW.key;
END;

CREATE TRIGGER sessions_tombstone AFTER DELETE ON sessions
WHEN OLD.uid IS NOT NULL
BEGIN
  INSERT INTO tombstones (table_name, uid) VALUES ('sessions', OLD.uid)
  ON CONFLICT (table_name, uid) DO UPDATE SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
END;

CREATE TRIGGER session_exercises_tombstone AFTER DELETE ON session_exercises
WHEN OLD.uid IS NOT NULL
BEGIN
  INSERT INTO tombstones (table_name, uid) VALUES ('session_exercises', OLD.uid)
  ON CONFLICT (table_name, uid) DO UPDATE SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
END;

CREATE TRIGGER session_sets_tombstone AFTER DELETE ON session_sets
WHEN OLD.uid IS NOT NULL
BEGIN
  INSERT INTO tombstones (table_name, uid) VALUES ('session_sets', OLD.uid)
  ON CONFLICT (table_name, uid) DO UPDATE SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
END;
