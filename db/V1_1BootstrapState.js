const db = require('ocore/db');

function normalizeRow(row) {
	if (!row)
		return null;

	return {
		network: row.network,
		scanStartTimestamp: Number(row.scan_start_timestamp),
		fromBlock: Number(row.from_block),
		toBlock: Number(row.to_block),
		nextFromBlock: Number(row.next_from_block),
		contractIndex: Number(row.contract_index),
		scanIndex: Number(row.scan_index),
		contractAddresses: row.contract_addresses ? JSON.parse(row.contract_addresses) : [],
		bootstrapStartedAt: row.bootstrap_started_at,
		bootstrapCompletedAt: row.bootstrap_completed_at,
		updatedAt: row.updated_at,
	};
}

class V1_1BootstrapState {
	static async get(network) {
		const rows = await db.query(
			`SELECT
				network,
				scan_start_timestamp,
				from_block,
				to_block,
				next_from_block,
				contract_index,
				scan_index,
				contract_addresses,
				bootstrap_started_at,
				bootstrap_completed_at,
				updated_at
			FROM v1_1_bootstrap_state
			WHERE network = ?`,
			[network]
		);

		return normalizeRow(rows[0]);
	}

	static async save({
		network,
		scanStartTimestamp,
		fromBlock,
		toBlock,
		nextFromBlock,
		contractIndex,
		scanIndex,
		contractAddresses,
	}) {
		const contractAddressesJson = JSON.stringify(contractAddresses || []);
		await db.query(
			`INSERT INTO v1_1_bootstrap_state (
				network,
				scan_start_timestamp,
				from_block,
				to_block,
				next_from_block,
				contract_index,
				scan_index,
				contract_addresses,
				bootstrap_started_at,
				updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
			ON CONFLICT(network) DO UPDATE SET
				scan_start_timestamp = excluded.scan_start_timestamp,
				from_block = excluded.from_block,
				to_block = excluded.to_block,
				next_from_block = excluded.next_from_block,
				contract_index = excluded.contract_index,
				scan_index = excluded.scan_index,
				contract_addresses = excluded.contract_addresses,
				updated_at = CURRENT_TIMESTAMP`,
			[
				network,
				scanStartTimestamp,
				fromBlock,
				toBlock,
				nextFromBlock,
				contractIndex,
				scanIndex,
				contractAddressesJson,
			]
		);
	}

	static async markCompleted(network) {
		await db.query(
			`UPDATE v1_1_bootstrap_state
			SET bootstrap_completed_at = CURRENT_TIMESTAMP,
				updated_at = CURRENT_TIMESTAMP
			WHERE network = ?`,
			[network]
		);
	}
}

module.exports = V1_1BootstrapState;
