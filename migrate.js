// migrate.js
import Database from 'better-sqlite3'
const db = new Database('../Yeek/registrations.sqlite3');

const migrate = db.transaction(() => {
  db.prepare(`UPDATE aliases SET clean_string = LOWER(clean_string)`).run();
  db.prepare(`UPDATE signups SET clean_weapon_string = LOWER(clean_weapon_string)`).run();
});

migrate();
console.log('Migration complete. All clean names are now lowercase.');
