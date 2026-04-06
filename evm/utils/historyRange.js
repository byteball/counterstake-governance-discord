const sleep = require('../../utils/sleep');

const OVERSCAN_MULTIPLIER = 1.2;
const SECONDS_IN_DAY = 24 * 60 * 60;
const DEFAULT_BLOCK_LOAD_RETRY_ATTEMPTS = 5;
const DEFAULT_BLOCK_LOAD_RETRY_DELAY_SECONDS = 2;

function getEstimatedLookbackBlocks({ lookbackDays, avgBlockTimeSeconds }) {
	const normalizedAvgBlockTimeSeconds = Number(avgBlockTimeSeconds);
	if (!Number.isFinite(normalizedAvgBlockTimeSeconds) || normalizedAvgBlockTimeSeconds <= 0) {
		throw new Error(`Invalid avgBlockTimeSeconds: ${avgBlockTimeSeconds}`);
	}

	const normalizedLookbackDays = Math.max(Number(lookbackDays) || 0, 0);
	return Math.ceil((normalizedLookbackDays * SECONDS_IN_DAY / normalizedAvgBlockTimeSeconds) * OVERSCAN_MULTIPLIER);
}

function getPositiveInteger(value, fallback) {
	const normalized = Number(value);
	if (!Number.isFinite(normalized) || normalized <= 0)
		return fallback;

	return Math.floor(normalized);
}

async function getBlockWithRetry(provider, blockNumber, options = {}) {
	const attempts = getPositiveInteger(options.blockLoadRetryAttempts, DEFAULT_BLOCK_LOAD_RETRY_ATTEMPTS);
	const delaySeconds = Number.isFinite(Number(options.blockLoadRetryDelaySeconds)) && Number(options.blockLoadRetryDelaySeconds) >= 0
		? Number(options.blockLoadRetryDelaySeconds)
		: DEFAULT_BLOCK_LOAD_RETRY_DELAY_SECONDS;
	const sleepFn = options.sleepFn || sleep;
	let lastError = null;

	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			const block = await provider.getBlock(blockNumber);
			if (block)
				return block;

			lastError = new Error(`Empty block response for ${blockNumber}`);
		} catch (error) {
			lastError = error;
		}

		if (attempt < attempts) {
			console.warn(
				`[historyRange] failed to load block ${blockNumber}, retry ${attempt}/${attempts - 1} in ${delaySeconds}s`,
				lastError
			);
			await sleepFn(delaySeconds);
		}
	}

	const finalError = new Error(`Failed to load block ${blockNumber} for historical range after ${attempts} attempts`);
	if (lastError)
		finalError.cause = lastError;
	throw finalError;
}

async function getRangeByStartTimestamp(provider, { startTimestamp, confirmations = 0, avgBlockTimeSeconds, explicitToBlock = null, ...retryOptions }) {
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
	const anchorBlock = await getBlockWithRetry(provider, toBlock, retryOptions);

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
	DEFAULT_BLOCK_LOAD_RETRY_ATTEMPTS,
	DEFAULT_BLOCK_LOAD_RETRY_DELAY_SECONDS,
	getEstimatedLookbackBlocks,
	getBlockWithRetry,
	getRangeByStartTimestamp,
	getHistoricalRange,
};
