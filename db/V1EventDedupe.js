class V1EventDedupe {
	static async claim(network, address, txHash, candidateKey, eventType) {
		const db = require('ocore/db');
		const result = await db.query(
			`INSERT OR IGNORE INTO v1_event_dedupe(network, address, tx_hash, candidate_key, event_type)
			VALUES(?, ?, ?, ?, ?)`,
			[network, address, txHash, candidateKey, eventType]
		);
		return !!result.affectedRows;
	}
}

module.exports = V1EventDedupe;
