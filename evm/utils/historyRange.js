const OVERSCAN_MULTIPLIER = 1.2;
const SECONDS_IN_DAY = 24 * 60 * 60;

function getEstimatedLookbackBlocks({ lookbackDays, avgBlockTimeSeconds }) {
	const normalizedAvgBlockTimeSeconds = Number(avgBlockTimeSeconds);
	if (!Number.isFinite(normalizedAvgBlockTimeSeconds) || normalizedAvgBlockTimeSeconds <= 0) {
		throw new Error(`Invalid avgBlockTimeSeconds: ${avgBlockTimeSeconds}`);
	}

	const normalizedLookbackDays = Math.max(Number(lookbackDays) || 0, 0);
	return Math.ceil((normalizedLookbackDays * SECONDS_IN_DAY / normalizedAvgBlockTimeSeconds) * OVERSCAN_MULTIPLIER);
}

async function getRangeByStartTimestamp(provider, { startTimestamp, confirmations = 0, avgBlockTimeSeconds, explicitToBlock = null }) {
	const normalizedStartTimestamp = Number(startTimestamp);
	if (!Number.isFinite(normalizedStartTimestamp) || normalizedStartTimestamp < 0)
		throw new Error(`Invalid startTimestamp: ${startTimestamp}`);

	const latestBlock = await provider.getBlockNumber();
	const normalizedConfirmations = Math.max(Number(confirmations) || 0, 0);
	if (latestBlock < normalizedConfirmations)
		return null;

	const toBlock = explicitToBlock === null
		? latestBlock - normalizedConfirmations
		: Math.max(Number(explicitToBlock) || 0, 0);
	const anchorBlock = await provider.getBlock(toBlock);
	if (!anchorBlock)
		throw new Error(`Failed to load block ${toBlock} for historical range`);

	const secondsDiff = Math.max(anchorBlock.timestamp - normalizedStartTimestamp, 0);
	const estimatedLookbackBlocks = getEstimatedLookbackBlocks({
		lookbackDays: secondsDiff / SECONDS_IN_DAY,
		avgBlockTimeSeconds,
	});
	const fromBlock = normalizedStartTimestamp >= anchorBlock.timestamp
		? toBlock
		: Math.max(toBlock - estimatedLookbackBlocks, 0);

	return {
		fromBlock,
		toBlock,
		latestBlock,
		anchorTimestamp: anchorBlock.timestamp,
		estimatedLookbackBlocks,
	};
}

async function getHistoricalRange(provider, { lookbackDays, confirmations, avgBlockTimeSeconds }) {
	const latestBlock = await provider.getBlockNumber();
	const normalizedConfirmations = Math.max(Number(confirmations) || 0, 0);
	if (latestBlock < normalizedConfirmations)
		return null;

	const toBlock = latestBlock - normalizedConfirmations;
	const estimatedLookbackBlocks = getEstimatedLookbackBlocks({
		lookbackDays,
		avgBlockTimeSeconds,
	});
	const fromBlock = Math.max(toBlock - estimatedLookbackBlocks, 0);

	return {
		fromBlock,
		toBlock,
		latestBlock,
		estimatedLookbackBlocks,
	};
}

module.exports = {
	OVERSCAN_MULTIPLIER,
	SECONDS_IN_DAY,
	getEstimatedLookbackBlocks,
	getRangeByStartTimestamp,
	getHistoricalRange,
};
