const db = require('ocore/db');

async function createWeb3AddressesTable() {
  await db.query(`CREATE TABLE IF NOT EXISTS web3_addresses (
        network TEXT NOT NULL,
        address TEXT(50) NOT NULL,
        last_block INTEGER DEFAULT 0 NOT NULL,
\tCONSTRAINT web3_addresses_PK PRIMARY KEY (network, address)
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
  console.log('migration done')
}

module.exports = {
  init,
}
