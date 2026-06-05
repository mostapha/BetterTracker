const db = require('./schema');


try {
  db.exec('ALTER TABLE signups ADD COLUMN message_timestamp DATETIME;');
} catch (e) {
  // Column already exists
}

db.exec(`
  -- Reset all scan data so the scanner rebuilds everything with accurate timestamps
  DELETE FROM signups;
  DELETE FROM pending_terms;
  DELETE FROM user_stats;
`);
 

const setStartMessage = db.prepare(`
  INSERT OR REPLACE INTO scan_state (channel_id, last_message_id) 
  VALUES (?, ?)
`);

const channelStartPoints = [
  ['1247901833188478996', '1443360027246067803'], // channel_id, message_id to start from
  ['1274705683283054652', '1443667945095172389'],
];


const seedTransaction = db.transaction(() => {
  for (const [channelId, messageId] of channelStartPoints) setStartMessage.run(channelId, messageId);
});



seedTransaction();
console.log('complete.');