const db = require('./schema');

const setStartMessage = db.prepare(`
  INSERT OR REPLACE INTO scan_state (channel_id, last_message_id) 
  VALUES (?, ?)
`);

const channelStartPoints = [
  ['1247901833188478996', '1511759968087310558'], // channel_id, message_id to start from
  ['1274705683283054652', '1511720623984869478'],
];


const seedTransaction = db.transaction(() => {
  for (const [channelId, messageId] of channelStartPoints) setStartMessage.run(channelId, messageId);
});


seedTransaction();
console.log('complete.');