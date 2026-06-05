const { Client, GatewayIntentBits } = require('discord.js');
const { config } = require('dotenv');

config();

const TOKEN = process.env.BOT_TOKEN;
const SIGNUP_CHANNELS = ['1247901833188478996','1274705683283054652']; 
const YEEK_BOT_ID = '1374562166795010058';


const db = require('./schema');

// --- PREPARED STATEMENTS ---
const getLastMessageId = db.prepare('SELECT last_message_id FROM scan_state WHERE channel_id = ?');
const setLastMessageId = db.prepare('INSERT INTO scan_state (channel_id, last_message_id) VALUES (?, ?) ON CONFLICT(channel_id) DO UPDATE SET last_message_id = excluded.last_message_id');
const insertPending = db.prepare('INSERT OR IGNORE INTO pending_terms (term) VALUES (?)');
const countPending = db.prepare('SELECT COUNT(*) as count FROM pending_terms');

const insertSignup = db.prepare(`
  INSERT OR IGNORE INTO signups (message_id, user_id, raw_slot_string, clean_weapon_string, status, message_timestamp) 
  VALUES (?, ?, ?, ?, ?, ?)
`);

const getPendingSignups = db.prepare("SELECT id, raw_slot_string FROM signups WHERE status = 'pending'");
const updateResolvedSignup = db.prepare("UPDATE signups SET clean_weapon_string = ?, status = 'valid' WHERE id = ?");


const ignoredTerms = new Set(db.prepare('SELECT term FROM ignored_terms').all().map(r => r.term));
const aliasMap = new Map(db.prepare('SELECT raw_string, clean_string FROM aliases').all().map(r => [r.raw_string, r.clean_string]));

// --- PARSER LOGIC ---
function parseLine(line) {
  const match = line.match(/^\d+\.\s*(.*?)\s*<@!?(\d+)>/);
  if (!match) return null;

  const rawSlot = match[1].toLowerCase().trim();
  const userId = match[2];

  const parts = rawSlot.split(/\/|\bor\b/i).map(p => p.trim()).filter(Boolean);

  const cleanParts = [];
  const pendingTerms = [];

  for (const part of parts) {
    const cleanPart = part.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '').trim(); 
    if (!cleanPart) continue;

    if (ignoredTerms.has(cleanPart)) continue; 

    const aliasMatch = aliasMap.get(cleanPart);
    if (aliasMatch) {
      cleanParts.push(aliasMatch);
    } else {
      pendingTerms.push(cleanPart);
    }
  }

  if (cleanParts.length === 0 && pendingTerms.length === 0) return null;

  cleanParts.sort();
  const cleanWeaponString = cleanParts.join('/');
  const status = pendingTerms.length > 0 ? 'pending' : 'valid';

  return { userId, rawSlot, cleanWeaponString, status, pendingTerms };
}


// --- SELF-HEALING REPROCESSOR ---
function reprocessPendingSignups() {
  console.log('Checking for pending signups to resolve...');
  const pendingRows = getPendingSignups.all();

  const resolveTransaction = db.transaction((rows) => {
    let count = 0;
    for (const row of rows) {
      const mockLine = `1. ${row.raw_slot_string} <@000>`;
      const parsed = parseLine(mockLine);
      if (parsed && parsed.status === 'valid') {
        updateResolvedSignup.run(parsed.cleanWeaponString, row.id);
        count++;
      }
    }
    return count;
  });

  const resolvedCount = resolveTransaction(pendingRows);
  console.log(`Resolved ${resolvedCount} previously pending signups.`);

  const stillPending = countPending.get();
  console.log(`Pending terms still awaiting mapping: ${stillPending.count}`);
}


// --- USER STATS REBUILD ---
// Recount everything from signups so user_stats is always correct,
// even if scan_state was reset and messages were re-processed.
//
// Counts ALL signups per user (valid + pending).
// first_seen / last_seen are derived from the signups timestamp column.
function rebuildUserStats() {
  console.log('Rebuilding user_stats from signups...');
  db.exec(`
    DELETE FROM user_stats;

    INSERT INTO user_stats (user_id, signup_count, first_seen, last_seen)
    SELECT
      user_id,
      COUNT(*) AS signup_count,
      MIN(message_timestamp) AS first_seen,
      MAX(message_timestamp) AS last_seen
    FROM signups
    GROUP BY user_id;
  `);
  const { count } = db.prepare('SELECT COUNT(*) as count FROM user_stats').get();
  console.log(`user_stats rebuilt: ${count} users tracked.`);
}


// --- MAIN SCANNER ---
async function scanChannels(client) {
  console.log('Starting execution of historical message parser...');
  
  reprocessPendingSignups();

  for (const channelId of SIGNUP_CHANNELS) {
    console.log(`Scanning channel ${channelId}...`);
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel) continue;

      const stateRow = getLastMessageId.get(channelId);
      let lastCheckedId = stateRow ? stateRow.last_message_id : null;
      let totalProcessed = 0;
      let hasMoreMessages = true;

      while (hasMoreMessages) {
        let options = { limit: 100 };
        if (lastCheckedId) {
          options.after = lastCheckedId;
        }

        let messages = await channel.messages.fetch(options);
        if (messages.size === 0) {
          hasMoreMessages = false;
          break;
        }

        const sortedMessages = Array.from(messages.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
        
        const processBatchTransaction = db.transaction((msgArray, chanId) => {
          let latestId = null;

          for (const msg of msgArray) {
            latestId = msg.id;
            if (msg.author.id !== YEEK_BOT_ID) continue;
              
            const lines = msg.content.split('\n');
            const msgTimestamp = new Date(msg.createdTimestamp).toISOString();
            
            for (const line of lines) {
              const parsed = parseLine(line);
              if (!parsed) continue;

              for (const term of parsed.pendingTerms) {
                insertPending.run(term);
              }

              const finalWeaponString = parsed.status === 'pending' ? null : parsed.cleanWeaponString;

              insertSignup.run(
                msg.id, 
                parsed.userId, 
                parsed.rawSlot, 
                finalWeaponString,
                parsed.status,
                msgTimestamp
              );
            }
          }

          if (latestId) {
            setLastMessageId.run(chanId, latestId);
          }
          
          return latestId; 
        });

        lastCheckedId = processBatchTransaction(sortedMessages, channelId);
        
        totalProcessed += sortedMessages.length;
        console.log(`Fetched and processed batch of ${sortedMessages.length}...`);
      }

      console.log(`Finished channel ${channelId}. Total new messages processed: ${totalProcessed}`);

    } catch (error) {
      console.error(`Error processing channel ${channelId}:`, error);
      throw error; 
    }
  }

  console.log('Scan completed successfully.');
  rebuildUserStats();
  process.exit(0);
}


// --- DISCORD CLIENT ---
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

client.once('ready', async () => {
  try {
    await scanChannels(client);
  } catch (err) {
    console.error('Fatal error during scan execution:', err);
    process.exit(1);
  }
});

client.login(TOKEN);