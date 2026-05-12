const db = require('ocore/db');

class V1_1 {
	static async getCursor(network, address) {
		const rows = await db.query(
			"SELECT last_replayed_block FROM v1_1_event_cursors WHERE network = ? AND address = ?",
			[network, address]
		);
		if (rows.length) {
			return rows[0].last_replayed_block;
		}
		return null;
	}

	static async setCursor(network, address, lastBlock) {
		await db.query(
			"INSERT OR REPLACE INTO v1_1_event_cursors(network, address, last_replayed_block) VALUES(?, ?, ?)",
			[network, address, lastBlock]
		);
	}

	static async claimEventDedupe(network, address, txHash, logIndex, blockNumber) {
		const result = await db.query(
			"INSERT OR IGNORE INTO v1_1_event_dedupe(network, address, tx_hash, log_index, block_number) VALUES(?, ?, ?, ?, ?)",
			[network, address, txHash, logIndex, blockNumber]
		);
		return !!result.affectedRows;
	}

	static async deleteEventDedupeUpToBlock(network, address, blockNumber) {
		await db.query(
			"DELETE FROM v1_1_event_dedupe WHERE network = ? AND address = ? AND block_number <= ?",
			[network, address, blockNumber]
		);
	}
}

module.exports = V1_1;
