const mutex = require('ocore/mutex');
const { ethers } = require("ethers");

const { getAbiByType } = require("../abi/getAbiByType");
const governanceHandlers = require("../eventHandlers/governance");
const uintHandlers = require("../eventHandlers/uint");
const uintArrayHandlers = require("../eventHandlers/uintArray");
const addressHandlers = require("../eventHandlers/address");
const V1_1BootstrapState = require("../../db/V1_1BootstrapState");
const { getHistoricalRange, getRangeByStartTimestamp, SECONDS_IN_DAY } = require("../utils/historyRange");
const { withRateLimitRetry } = require("../utils/withRateLimitRetry");
const HISTORY_SOURCE = 'evm_v1_1_history_log';
const DEFAULT_BOOTSTRAP_LOOKBACK_DAYS = 7;

const DEFAULT_OPTIONS = {
	lookbackDays: 1,
	intervalHours: 12,
	confirmations: 12,
	maxLogRangeBlocks: 10000,
};

class ProviderChangedError extends Error {
	constructor(network) {
		super(`[V1_1HistoricalChecker:${network}] provider changed during historical scan`);
		this.code = 'V1_1_PROVIDER_CHANGED';
	}
}

function getNonNegativeOption(value, fallback) {
	const normalized = Number(value);
	if (!Number.isFinite(normalized))
		return fallback;

	return Math.max(normalized, 0);
}

function getMinimumOption(value, fallback, minimum) {
	const normalized = Number(value);
	if (!Number.isFinite(normalized))
		return fallback;

	return Math.max(normalized, minimum);
}

function isBlockRangeTooLargeError(error) {
	const codes = [
		error?.code,
		error?.error?.code,
	];
	const message = [
		error?.error?.message,
		error?.shortMessage,
		error?.message,
	]
		.filter(Boolean)
		.join(' ');

	return codes.includes(-32062)
		|| codes.includes(35)
		|| /block range is too large/i.test(message)
		|| /ranges? over \d+ blocks? (?:are|is) not supported/i.test(message);
}

function getPositiveIntegerOption(value, fallback) {
	const normalized = Number(value);
	if (!Number.isFinite(normalized) || normalized <= 0)
		return fallback;

	return Math.floor(normalized);
}

function isProviderChangedError(error) {
	return error?.code === 'V1_1_PROVIDER_CHANGED';
}

function createVoteUnvoteScans(handlers) {
	return [
		{
			name: 'Vote',
			filter: ethersContract => ethersContract.filters.Vote(),
			handle: (contract, provider, log) => handlers.vote(contract, ...log.args, log, { source: HISTORY_SOURCE, provider }),
		},
		{
			name: 'Commit',
			filter: ethersContract => ethersContract.filters.Commit(),
			handle: (contract, provider, log) => handlers.commit(contract, ...log.args, log, { source: HISTORY_SOURCE, provider }),
		},
		{
			name: 'Unvote',
			filter: ethersContract => ethersContract.filters.Unvote(),
			handle: (contract, provider, log) => handlers.unvote(contract, provider, ...log.args, log, { source: HISTORY_SOURCE, blockTag: log.blockNumber, provider }),
		},
	];
}

const SCANS_BY_CONTRACT_TYPE = {
	governance: [
		{
			name: 'Deposit',
			filter: ethersContract => ethersContract.filters.Deposit(),
			handle: (contract, provider, log) => governanceHandlers.deposit(contract, ...log.args, log, { source: HISTORY_SOURCE, provider }),
		},
		{
			name: 'Withdrawal',
			filter: ethersContract => ethersContract.filters.Withdrawal(),
			handle: (contract, provider, log) => governanceHandlers.withdrawal(contract, ...log.args, log, { source: HISTORY_SOURCE, provider }),
		},
	],
	Uint: createVoteUnvoteScans(uintHandlers),
	UintArray: createVoteUnvoteScans(uintArrayHandlers),
	address: createVoteUnvoteScans(addressHandlers),
};

class V1_1HistoricalChecker {
	#providers = {};
	#contracts = {};
	#intervals = {};
	#bootstrappedNetworks = {};
	#pendingRuns = {};
	#resumeProgress = {};
	#lookbackDays;
	#intervalHours;
	#confirmations;
	#avgBlockTimeSeconds;
	#maxLogRangeBlocks;
	#retryOptions;
	#scanStartTimestamp;

	constructor(options = {}) {
		const merged = { ...DEFAULT_OPTIONS, ...options };
		this.#lookbackDays = getNonNegativeOption(merged.lookbackDays, DEFAULT_OPTIONS.lookbackDays);
		this.#intervalHours = getMinimumOption(merged.intervalHours, DEFAULT_OPTIONS.intervalHours, 1);
		this.#confirmations = getNonNegativeOption(merged.confirmations, DEFAULT_OPTIONS.confirmations);
		this.#avgBlockTimeSeconds = merged.avgBlockTimeSeconds || {};
		this.#maxLogRangeBlocks = getPositiveIntegerOption(merged.maxLogRangeBlocks, DEFAULT_OPTIONS.maxLogRangeBlocks);
		this.#retryOptions = merged.retryOptions || {};
		this.#scanStartTimestamp = merged.scanStartTimestamp !== null
			&& merged.scanStartTimestamp !== undefined
			&& Number.isFinite(Number(merged.scanStartTimestamp))
			? Number(merged.scanStartTimestamp)
			: null;
	}

	setProvider(network, provider) {
		this.#providers[network] = provider;
		this.#ensureNetwork(network, true);
	}

	setContracts(network, contracts) {
		this.#contracts[network] = (contracts || []).filter(contract => contract?.meta?.aa_version === 'v1.1');
		this.#ensureNetwork(network, false);
	}

	async runNetwork(network) {
		const unlock = await mutex.lockOrSkip(`V1_1HistoricalChecker.${network}`);
		if (!unlock) {
			this.#pendingRuns[network] = true;
			return false;
		}

		try {
			const provider = this.#providers[network];
			const contracts = this.#contracts[network];
			if (!provider || !contracts?.length)
				return false;

			const avgBlockTimeSeconds = this.#avgBlockTimeSeconds[network];
			const resumeState = await this.#getOrCreateResumeState(network, provider, contracts, avgBlockTimeSeconds);
			if (!resumeState)
				return false;

			const { range, resumed, mode } = resumeState;
			if (!range)
				return false;

			if (resumed) {
				const currentContract = contracts[resumeState.contractIndex];
				const scans = currentContract ? this.#getScansForContract(currentContract) : [];
				const currentScanName = scans[resumeState.scanIndex]?.name || 'completed';
				console.log(
					`[V1_1HistoricalChecker:${network}] resuming ${mode} progress at contract ${resumeState.contractIndex + 1}/${contracts.length}, ` +
					`scan=${currentScanName}, nextFromBlock=${resumeState.nextFromBlock}`
				);
			} else {
				console.log(
					`[V1_1HistoricalChecker:${network}] scanning ${mode} blocks ${range.fromBlock}-${range.toBlock} ` +
					`for ${contracts.length} contracts (confirmations=${this.#confirmations}, avgBlockTimeSeconds=${avgBlockTimeSeconds}, ` +
					`estimatedLookbackBlocks=${range.estimatedLookbackBlocks})`
				);
			}

			for (let contractIndex = resumeState.contractIndex; contractIndex < contracts.length; contractIndex++) {
				const contract = contracts[contractIndex];
				try {
					await this.#scanContract(provider, contract, range, {
						contractIndex,
						totalContracts: contracts.length,
					});
				} catch (e) {
					console.error(`[V1_1HistoricalChecker:${network}] failed contract ${contract.address}`, e);
					throw e;
				}
			}

			console.log(`[V1_1HistoricalChecker:${network}] run complete`);
			if (mode === 'bootstrap')
				await V1_1BootstrapState.markCompleted(network);
			this.#clearResumeState(network);
			return true;
		} catch (e) {
			if (isProviderChangedError(e)) {
				return false;
			}

			console.error(`[V1_1HistoricalChecker:${network}] failed`, e);
			return false;
		} finally {
			unlock();
			if (this.#pendingRuns[network]) {
				delete this.#pendingRuns[network];
				setImmediate(() => {
					this.runNetwork(network);
				});
			}
		}
	}

	#ensureNetwork(network, runImmediately) {
		const provider = this.#providers[network];
		const contracts = this.#contracts[network];
		if (!provider || !contracts?.length)
			return;

		if (!this.#intervals[network]) {
			this.#intervals[network] = setInterval(() => {
				this.runNetwork(network);
			}, this.#intervalHours * 60 * 60 * 1000);
		}

		if (runImmediately || !this.#bootstrappedNetworks[network]) {
			this.#bootstrappedNetworks[network] = true;
			this.runNetwork(network);
		}
	}

	async #scanContract(provider, contract, range, progress = {}) {
		this.#assertProviderStillCurrent(contract.meta.network, provider);
		const ethersContract = new ethers.Contract(contract.address, getAbiByType(contract.type), provider);
		const scans = this.#getScansForContract(contract);
		const network = contract.meta.network;
		const state = this.#resumeProgress[network];
		const startScanIndex = state?.contractIndex === progress.contractIndex ? state.scanIndex : 0;

		for (let scanIndex = startScanIndex; scanIndex < scans.length; scanIndex++) {
			const scan = scans[scanIndex];
			try {
				const resumeFromBlock = this.#getResumeFromBlock(network, range, progress.contractIndex, scanIndex);
				if (resumeFromBlock > range.toBlock) {
					await this.#advanceResumeStateAfterScan(network, progress.contractIndex, scanIndex, scans.length);
					continue;
				}

				await this.#consumeLogsWithAdaptiveRange(
					provider,
					ethersContract,
					scan.filter(ethersContract),
					resumeFromBlock,
					range.toBlock,
					contract,
					scan.name,
					async (logs, processedRange) => {
						for (const log of logs) {
							await scan.handle(contract, provider, log);
						}
						await this.#setResumeNextFromBlock(network, processedRange.toBlock + 1);
					}
				);
				await this.#advanceResumeStateAfterScan(network, progress.contractIndex, scanIndex, scans.length);
			} catch (e) {
				console.error(`[V1_1HistoricalChecker:${contract.meta.network}] failed ${scan.name} for ${contract.address}`, e);
				throw e;
			}
		}
	}

	async #consumeLogsWithAdaptiveRange(provider, ethersContract, filter, fromBlock, toBlock, contract, scanName, onLogs) {
		this.#assertProviderStillCurrent(contract.meta.network, provider);
		if (toBlock - fromBlock + 1 > this.#maxLogRangeBlocks) {
			const ranges = [];
			for (let chunkFromBlock = fromBlock; chunkFromBlock <= toBlock; chunkFromBlock += this.#maxLogRangeBlocks) {
				ranges.push({
					fromBlock: chunkFromBlock,
					toBlock: Math.min(chunkFromBlock + this.#maxLogRangeBlocks - 1, toBlock),
				});
			}
			for (let rangeIndex = 0; rangeIndex < ranges.length; rangeIndex++) {
				const range = ranges[rangeIndex];

				await this.#consumeLogsWithAdaptiveRange(
					provider,
					ethersContract,
					filter,
					range.fromBlock,
					range.toBlock,
					contract,
					scanName,
					onLogs
				);
			}

			return;
		}

		try {
			const logs = await withRateLimitRetry(
				`V1_1HistoricalChecker.${contract.meta.network}.${scanName}:${contract.address}:${fromBlock}-${toBlock}`,
				() => ethersContract.queryFilter(filter, fromBlock, toBlock),
				this.#retryOptions
			);
			await onLogs(logs, { fromBlock, toBlock });
		} catch (e) {
			if (!isBlockRangeTooLargeError(e) || fromBlock >= toBlock)
				throw e;

			const middleBlock = Math.floor((fromBlock + toBlock) / 2);

			await this.#consumeLogsWithAdaptiveRange(provider, ethersContract, filter, fromBlock, middleBlock, contract, scanName, onLogs);
			await this.#consumeLogsWithAdaptiveRange(provider, ethersContract, filter, middleBlock + 1, toBlock, contract, scanName, onLogs);
		}
	}

	#getScansForContract(contract) {
		return SCANS_BY_CONTRACT_TYPE[contract.type] || [];
	}

	#assertProviderStillCurrent(network, provider) {
		if (this.#providers[network] !== provider)
			throw new ProviderChangedError(network);
	}

	#getBootstrapStartTimestamp() {
		if (this.#scanStartTimestamp !== null)
			return this.#scanStartTimestamp;

		return Math.floor(Date.now() / 1000) - (DEFAULT_BOOTSTRAP_LOOKBACK_DAYS * SECONDS_IN_DAY);
	}

	async #getOrCreateResumeState(network, provider, contracts, avgBlockTimeSeconds) {
		const bootstrapState = await this.#getOrCreateBootstrapResumeState(network, provider, contracts, avgBlockTimeSeconds);
		if (bootstrapState)
			return bootstrapState;

		return this.#getOrCreateRollingResumeState(network, provider, contracts, avgBlockTimeSeconds);
	}

	async #getOrCreateBootstrapResumeState(network, provider, contracts, avgBlockTimeSeconds) {
		const storedState = await V1_1BootstrapState.get(network);
		if (storedState?.bootstrapCompletedAt)
			return null;

		const contractAddresses = contracts.map(contract => contract.address);
		if (!storedState) {
			return this.#createBootstrapResumeState(network, provider, contractAddresses, avgBlockTimeSeconds);
		}

		if (!this.#isContractSetCompatible(storedState, contracts)) {
			return this.#createBootstrapResumeState(network, provider, contractAddresses, avgBlockTimeSeconds, storedState.scanStartTimestamp);
		}

		this.#resumeProgress[network] = {
			mode: 'bootstrap',
			scanStartTimestamp: storedState.scanStartTimestamp,
			range: {
				fromBlock: storedState.fromBlock,
				toBlock: storedState.toBlock,
				estimatedLookbackBlocks: Math.max(storedState.toBlock - storedState.fromBlock, 0),
			},
			contractIndex: storedState.contractIndex,
			scanIndex: storedState.scanIndex,
			nextFromBlock: storedState.nextFromBlock,
			contractAddresses,
		};

		return {
			...this.#resumeProgress[network],
			resumed: true,
		};
	}

	async #createBootstrapResumeState(network, provider, contractAddresses, avgBlockTimeSeconds, startTimestamp = null) {
		const bootstrapStartTimestamp = startTimestamp !== null
			&& startTimestamp !== undefined
			&& Number.isFinite(Number(startTimestamp))
			? Number(startTimestamp)
			: this.#getBootstrapStartTimestamp();
		const range = await getRangeByStartTimestamp(provider, {
			startTimestamp: bootstrapStartTimestamp,
			confirmations: this.#confirmations,
			avgBlockTimeSeconds,
		});
		if (!range)
			return null;

		this.#resumeProgress[network] = {
			mode: 'bootstrap',
			scanStartTimestamp: bootstrapStartTimestamp,
			range,
			contractIndex: 0,
			scanIndex: 0,
			nextFromBlock: range.fromBlock,
			contractAddresses,
		};
		await this.#persistResumeState(network, bootstrapStartTimestamp);

		return {
			...this.#resumeProgress[network],
			resumed: false,
		};
	}

	async #getOrCreateRollingResumeState(network, provider, contracts, avgBlockTimeSeconds) {
		const existingState = this.#resumeProgress[network];
		if (this.#isResumeStateCompatible(existingState, contracts)) {
			return {
				...existingState,
				mode: 'rolling',
				resumed: true,
			};
		}

		const range = await getHistoricalRange(provider, {
			lookbackDays: this.#lookbackDays,
			confirmations: this.#confirmations,
			avgBlockTimeSeconds,
		});
		if (!range)
			return null;

		this.#resumeProgress[network] = {
			mode: 'rolling',
			range,
			contractIndex: 0,
			scanIndex: 0,
			nextFromBlock: range.fromBlock,
			contractAddresses: contracts.map(contract => contract.address),
		};
		return {
			...this.#resumeProgress[network],
			resumed: false,
		};
	}

	#isResumeStateCompatible(state, contracts) {
		if (!state?.range || !Array.isArray(state.contractAddresses))
			return false;
		if (state.contractAddresses.length !== contracts.length)
			return false;

		return state.contractAddresses.every((address, index) => address === contracts[index]?.address);
	}

	#isContractSetCompatible(state, contracts) {
		if (!Array.isArray(state?.contractAddresses))
			return false;
		if (state.contractAddresses.length !== contracts.length)
			return false;

		return state.contractAddresses.every((address, index) => address === contracts[index]?.address);
	}

	#getResumeFromBlock(network, range, contractIndex, scanIndex) {
		const state = this.#resumeProgress[network];
		if (!state)
			return range.fromBlock;
		if (state.contractIndex !== contractIndex || state.scanIndex !== scanIndex)
			return range.fromBlock;
		return state.nextFromBlock;
	}

	async #setResumeNextFromBlock(network, nextFromBlock) {
		const state = this.#resumeProgress[network];
		if (!state)
			return;

		state.nextFromBlock = nextFromBlock;
		if (state.mode === 'bootstrap')
			await this.#persistResumeState(network);
	}

	async #advanceResumeStateAfterScan(network, contractIndex, scanIndex, scansLength) {
		const state = this.#resumeProgress[network];
		if (!state)
			return;

		if (scanIndex + 1 < scansLength) {
			state.contractIndex = contractIndex;
			state.scanIndex = scanIndex + 1;
			state.nextFromBlock = state.range.fromBlock;
			if (state.mode === 'bootstrap')
				await this.#persistResumeState(network);
			return;
		}

		state.contractIndex = contractIndex + 1;
		state.scanIndex = 0;
		state.nextFromBlock = state.range.fromBlock;
		if (state.mode === 'bootstrap')
			await this.#persistResumeState(network);
	}

	async #persistResumeState(network, scanStartTimestamp = null) {
		const state = this.#resumeProgress[network];
		if (!state || state.mode !== 'bootstrap')
			return;

		await V1_1BootstrapState.save({
			network,
			scanStartTimestamp: scanStartTimestamp !== null
				&& scanStartTimestamp !== undefined
				&& Number.isFinite(Number(scanStartTimestamp))
				? Number(scanStartTimestamp)
				: state.scanStartTimestamp,
			fromBlock: state.range.fromBlock,
			toBlock: state.range.toBlock,
			nextFromBlock: state.nextFromBlock,
			contractIndex: state.contractIndex,
			scanIndex: state.scanIndex,
			contractAddresses: state.contractAddresses,
		});
	}

	#clearResumeState(network) {
		delete this.#resumeProgress[network];
	}
}

module.exports = V1_1HistoricalChecker;
