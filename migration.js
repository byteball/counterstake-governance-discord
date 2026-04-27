const db = require('ocore/db');

async function createWeb3AddressesTable() {
  await db.query(`CREATE TABLE IF NOT EXISTS web3_addresses (
        network TEXT NOT NULL,
        address TEXT(50) NOT NULL,
        last_block INTEGER DEFAULT 0 NOT NULL,
\tCONSTRAINT web3_addresses_PK PRIMARY KEY (network, address)
)`);
}

async function createV1_1EventCursorsTable() {
  await db.query(`CREATE TABLE IF NOT EXISTS v1_1_event_cursors (
        network TEXT NOT NULL,
        address TEXT(50) NOT NULL,
        last_replayed_block INTEGER NOT NULL,
\tCONSTRAINT v1_1_event_cursors_PK PRIMARY KEY (network, address)
)`);
}

async function createV1_1EventDedupeTable() {
  await db.query(`CREATE TABLE IF NOT EXISTS v1_1_event_dedupe (
        network TEXT NOT NULL,
        address TEXT(50) NOT NULL,
        tx_hash TEXT NOT NULL,
        log_index INTEGER NOT NULL,
        block_number INTEGER NOT NULL,
\tCONSTRAINT v1_1_event_dedupe_PK PRIMARY KEY (network, address, tx_hash, log_index)
)`);
}

async function isLegacyWeb3AddressesSchema() {
  const rows = await db.query(`PRAGMA table_info(web3_addresses)`);
  if (!rows.length) {
    return false;
  }

  const columns = rows.map(row => row.name);
  return !columns.includes('network');
}

async function init() {
  if (await isLegacyWeb3AddressesSchema()) {
    await db.query(`DROP TABLE web3_addresses`);
  }

  await createWeb3AddressesTable();
  await createV1_1EventCursorsTable();
  await createV1_1EventDedupeTable();
  console.log('migration done')
}

module.exports = {
  init,
}
