const db = require('ocore/db');

async function hasEvent(eventId) {
	const rows = await db.query('SELECT 1 FROM logs WHERE event_id = ? LIMIT 1', [eventId]);
	return rows.length > 0;
}

async function saveEventLog(entry) {
	await db.query(
		`INSERT INTO logs(event_id, network, address, tx_hash, aa_version, event_type, event_name, source, payload_json, published_at)
				VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
		[
			entry.event_id,
			entry.network,
			entry.address,
			entry.tx_hash,
			entry.aa_version,
			entry.event_type,
			entry.event_name,
			entry.source,
			entry.payload_json,
		]
	);
}

module.exports = {
	hasEvent,
	saveEventLog,
};
