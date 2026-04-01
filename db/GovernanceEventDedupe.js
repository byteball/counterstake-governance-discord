class GovernanceEventDedupe {
	static buildObyteKey({ aaAddress, triggerUnit }) {
		return `obyte:${aaAddress}:${triggerUnit}`;
	}

	static buildEvmTxKey({ network, txHash }) {
		return `evm_tx:${network}:${String(txHash).toLowerCase()}`;
	}

	static buildEvmLogKey({ network, txHash, logIndex }) {
		return `evm_log:${network}:${String(txHash).toLowerCase()}:${logIndex}`;
	}

	static buildEvmFallbackLogKey({ network, txHash, eventType, eventName, triggerAddress }) {
		return `evm_log:${network}:${String(txHash).toLowerCase()}:${eventType}:${eventName || ''}:${String(triggerAddress).toLowerCase()}`;
	}

	static getEvmLogIndex(transaction) {
		if (transaction?.log?.index !== undefined && transaction.log.index !== null)
			return transaction.log.index;
		if (transaction?.logIndex !== undefined && transaction.logIndex !== null)
			return transaction.logIndex;
		if (transaction?.index !== undefined && transaction.index !== null)
			return transaction.index;
		return null;
	}

	static createEvmTxRef({ network, contractAddress, txHash, source, eventType }) {
		return {
			dedupeKey: GovernanceEventDedupe.buildEvmTxKey({ network, txHash }),
			source,
			network,
			subjectAddress: contractAddress,
			triggerUnit: txHash,
			eventType,
		};
	}

	static createEvmLogRef({ network, contractAddress, txHash, transaction, eventType, eventName, triggerAddress, source }) {
		const logIndex = GovernanceEventDedupe.getEvmLogIndex(transaction);
		return {
			dedupeKey: logIndex !== null
				? GovernanceEventDedupe.buildEvmLogKey({ network, txHash, logIndex })
				: GovernanceEventDedupe.buildEvmFallbackLogKey({ network, txHash, eventType, eventName, triggerAddress }),
			source,
			network,
			subjectAddress: contractAddress,
			triggerUnit: txHash,
			eventType,
		};
	}

	static async markIfNew({ dedupeKey, source, network, subjectAddress, triggerUnit, eventType = null }) {
		const db = require('ocore/db');
		const result = await db.query(
			`INSERT OR IGNORE INTO governance_event_dedupe
			(dedupe_key, source, network, subject_address, trigger_unit, event_type)
			VALUES (?, ?, ?, ?, ?, ?)`,
			[dedupeKey, source, network, subjectAddress, triggerUnit, eventType]
		);
		return result.affectedRows === 1;
	}

	static async remove(dedupeKey) {
		const db = require('ocore/db');
		await db.query(
			`DELETE FROM governance_event_dedupe WHERE dedupe_key = ?`,
			[dedupeKey]
		);
	}
}

module.exports = GovernanceEventDedupe;
