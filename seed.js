
const db = require('./schema');




const setStartMessage = db.prepare(`
  INSERT OR IGNORE INTO scan_state (channel_id, last_message_id) 
  VALUES (?, ?)
`);

const channelStartPoints = [
  ['1247901833188478996', '1443360027246067803'], // channel_id, message_id to start from
  ['1274705683283054652', '1443667945095172389'],
];


const addAlias = db.prepare('INSERT OR IGNORE INTO aliases (raw_string, clean_string) VALUES (?, ?)');
const addIgnored = db.prepare('INSERT OR IGNORE INTO ignored_terms (term) VALUES (?)');



// Known weapon aliases — raw typos/shorthand → canonical name
// don't use any uppercase here
const aliases = [

  ['golem', 'golem'],


  ['1h mace', '1h mace'],
  ['mace', '1h mace'],

  ['hand of justice ', 'hand of justice'],
  ['hoj ', 'hand of justice'],


  ['heavy mace', 'heavy mace'],
  ['heavymace', 'heavy mace'],

  ['polehammer', 'polehammer'],
  ['polehummer', 'polehammer'],
  ['pole hummer', 'polehammer'],
  ['polehammer', 'polehammer'],

  ['great arcane', 'great arcane'],
  ['ga', 'great arcane'],

  ['1h arcane', '1h arcane'],
  ['1 hand arcane', '1h arcane'],

  ['rootbound', 'rootbound'],

  ['oathkeepers', 'oathkeepers'],
  ['oathkeeper', 'oathkeepers'],
  ['othkeeper', 'oathkeepers'],

  ['locus', 'locus'],

  ['lifecurse', 'lifecurse'],

  ['damnation', 'damnation'],
  ['damna', 'damnation'],

  ['carving', 'carving'],

  ['permafrost', 'permafrost'],
  ['perma', 'permafrost'],
  ['pemra', 'permafrost'],

  ['realmbreaker', 'realmbreaker'],
  ['realm', 'realmbreaker'],

  ['spirithunter', 'spirithunter'],
  ['spirit', 'spirithunter'],


  ['spiked', 'spiked'],

  ['rift glaive', 'rift glaive'],
  ['rift', 'rift glaive'],

  ['dawnsong', 'dawnsong'],
  ['dawensong', 'dawnsong'],

  ['infinity blade', 'infinity blade'],
  ['infintyblade', 'infinity blade'],

  ['longbow', 'longbow'],


  ['battle bracers', 'battle bracers'],
  ['bracers', 'battle bracers'],

  ['hallow', 'hallowfall'],
  ['hallowfall', 'hallowfall'],


  ['rampant', 'rampant'],

  ['redemption', 'redemption'],

  ['fallen staff', 'fallen staff'],
  ['fallen', 'fallen staff'],

  ['blight', 'blight'],

  // ... add everything you know
];

// Things that are never weapons
const ignored = [
  'caller',
  'tank',
  'support',
  'healer',
  'heal',
  'dps',
  'leering',
  'ward'
];


const seedTransaction = db.transaction(() => {
  for (const [raw, clean] of aliases) addAlias.run(raw, clean);
  for (const term of ignored) addIgnored.run(term);
  for (const [channelId, messageId] of channelStartPoints) setStartMessage.run(channelId, messageId);
});





seedTransaction();
console.log('Seed complete.');