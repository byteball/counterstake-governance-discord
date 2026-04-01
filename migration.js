const db = require('ocore/db');

function isWeb3AddressesSchemaValid(createTableSql) {
	if (!createTableSql)
		return false;

	const normalizedSql = createTableSql
		.toLowerCase()
		.replace(/\s+/g, ' ')
		.trim();

	return normalizedSql.includes('network text not null')
		&& normalizedSql.includes('address text(50) not null')
		&& normalizedSql.includes('last_block integer default 0 not null')
		&& normalizedSql.includes('primary key (network, address)');
}

async function ensureWeb3AddressesSchema() {
	const tables = await db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='web3_addresses'");
	if (tables.length) {
		const schemaRows = await db.query("SELECT sql FROM sqlite_master WHERE type='table' AND name='web3_addresses'");
		const isValidSchema = isWeb3AddressesSchemaValid(schemaRows[0]?.sql);

		if (!isValidSchema) {
			await db.query("DROP TABLE web3_addresses");
		}
	}

	await db.query(`CREATE TABLE IF NOT EXISTS web3_addresses (
		network TEXT NOT NULL,
		address TEXT(50) NOT NULL,
		last_block INTEGER DEFAULT 0 NOT NULL,
		CONSTRAINT web3_addresses_PK PRIMARY KEY (network, address)
)`);
}

async function init() {
	await ensureWeb3AddressesSchema();
	await db.query(`CREATE TABLE IF NOT EXISTS governance_event_dedupe (
		dedupe_key TEXT NOT NULL PRIMARY KEY,
		source TEXT NOT NULL,
		network TEXT NOT NULL,
		subject_address TEXT NOT NULL,
		trigger_unit TEXT NOT NULL,
		event_type TEXT NULL,
		created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
	await db.query(`CREATE TABLE IF NOT EXISTS v1_1_bootstrap_state (
		network TEXT NOT NULL PRIMARY KEY,
		scan_start_timestamp INTEGER NOT NULL,
		from_block INTEGER NOT NULL,
		to_block INTEGER NOT NULL,
		next_from_block INTEGER NOT NULL,
		contract_index INTEGER NOT NULL DEFAULT 0,
		scan_index INTEGER NOT NULL DEFAULT 0,
		contract_addresses TEXT NOT NULL,
		bootstrap_started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
		bootstrap_completed_at TIMESTAMP NULL,
		updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
}

module.exports = {
	init,
};
