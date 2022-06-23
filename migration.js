const db = require('ocore/db');

async function init() {
  await db.query(`CREATE TABLE IF NOT EXISTS web3_addresses (
        address TEXT(50) NOT NULL,
        last_block INTEGER DEFAULT 0 NOT NULL,
\tCONSTRAINT web3_addresses_PK PRIMARY KEY (address)
)`);
  console.log('migration done')
}

module.exports = {
  init,
}