function getLog(payload) {
	return payload?.log ?? payload;
}

function normalizeTimestamp(value) {
	if (value === undefined || value === null || value === '')
		return undefined;

	if (typeof value === 'bigint') {
		const timestamp = Number(value);
		return Number.isFinite(timestamp) ? Math.floor(timestamp) : undefined;
	}

	const numericTimestamp = Number(value);
	if (Number.isFinite(numericTimestamp))
		return Math.floor(numericTimestamp);

	const parsedTimestamp = Math.floor(Date.parse(value) / 1000);
	return Number.isFinite(parsedTimestamp) ? parsedTimestamp : undefined;
}

function buildEventBase(contract, transaction, extraFields) {
	const log = getLog(transaction);
	const event = {
		aa_address: contract.address,
		trigger_unit: log?.transactionHash,
		name: contract.name,
		...extraFields,
	};

	const timestamp = normalizeTimestamp(log?.blockTimestamp);
	if (timestamp !== undefined)
		event.timestamp = timestamp;
	else if (transaction?.log)
		event.timestamp = Math.floor(Date.now() / 1000);

	return event;
}

module.exports = {
	buildEventBase,
};
