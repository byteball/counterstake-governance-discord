const SOURCE_PRIORITY = {
	normal: 0,
	internal: 1,
};

function compareCandidateCalls(a, b) {
	if ((a.block_number || 0) !== (b.block_number || 0))
		return (a.block_number || 0) - (b.block_number || 0);
	if ((a.transaction_index || 0) !== (b.transaction_index || 0))
		return (a.transaction_index || 0) - (b.transaction_index || 0);
	if ((SOURCE_PRIORITY[a.source] || 0) !== (SOURCE_PRIORITY[b.source] || 0))
		return (SOURCE_PRIORITY[a.source] || 0) - (SOURCE_PRIORITY[b.source] || 0);
	return (a.call_index || 0) - (b.call_index || 0);
}

function getLastFullyProcessedBlock(transactions, processedCount) {
	if (!processedCount)
		return null;

	let lastFullyProcessedBlock = null;
	let index = 0;

	while (index < processedCount) {
		const blockNumber = Number(transactions[index]?.block_number);
		if (!Number.isFinite(blockNumber))
			return lastFullyProcessedBlock;

		let nextIndex = index + 1;
		while (nextIndex < transactions.length && Number(transactions[nextIndex]?.block_number) === blockNumber)
			nextIndex++;

		if (nextIndex > processedCount)
			return lastFullyProcessedBlock;

		lastFullyProcessedBlock = blockNumber;
		index = nextIndex;
	}

	return lastFullyProcessedBlock;
}

module.exports = {
	compareCandidateCalls,
	getLastFullyProcessedBlock,
};
