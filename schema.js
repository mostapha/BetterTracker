// schema.js
const Database = require('better-sqlite3');
const db = new Database('../Yeek/registrations.sqlite3');
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS scan_state (
    channel_id TEXT PRIMARY KEY,
    last_message_id TEXT
  );
  CREATE TABLE IF NOT EXISTS ignored_terms ( term TEXT PRIMARY KEY );
  CREATE TABLE IF NOT EXISTS aliases ( raw_string TEXT PRIMARY KEY, clean_string TEXT );
  CREATE TABLE IF NOT EXISTS pending_terms ( term TEXT PRIMARY KEY );
  CREATE TABLE IF NOT EXISTS signups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT,
    user_id TEXT,
    raw_slot_string TEXT,
    clean_weapon_string TEXT,
    status TEXT DEFAULT 'valid',
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    message_timestamp DATETIME,
    UNIQUE(message_id, user_id, raw_slot_string) 
  );
  CREATE TABLE IF NOT EXISTS user_stats (
    user_id TEXT PRIMARY KEY,
    signup_count INTEGER DEFAULT 0,
    first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

module.exports = db;