const mutex = require('ocore/mutex');
const { ethers } = require("ethers");

const sleep = require('../../utils/sleep')
const Web3_addresses = require('../../db/Web3_addresses');
const { getAbiByType } = require('../abi/getAbiByType');
const { getAddressTransactions } = require('../api/getAddressTransactions');
const { getInternalTransactions, selectFirstSuccessfulInternalTransaction } = require('../api/getInternalTransactions');
const { extractContractCallCandidatesFromMoralisTransaction } = require('../api/moralis');
const { eventsForV1 } = require('../eventsForV1');
const GovernanceEventDedupe = require('../../db/GovernanceEventDedupe');
const { compareCandidateCalls, getLastFullyProcessedBlock } = require('../utils/legacyV1History');
const { withRateLimitRetry } = require('../utils/withRateLimitRetry');
const { getRangeByStartTimestamp, SECONDS_IN_DAY } = require('../utils/historyRange');
const DataFetcher = require('./DataFetcher');
const Formatter = require('./Formatter');
const Discord = require("./Discord");

const DEFAULT_BOOTSTRAP_LOOKBACK_DAYS = 7;

class ContractRunnerForV1 {
	#contracts = {};
	#providers = {};
	#intervalInMinutes;
	#intervalInitialized = false;
	#scanStartTimestamp;
	#avgBlockTimeSeconds;
	#bootstrapStartBlocks = {};

	constructor(intervalInMinutes = 30, options = {}) {
		this.#intervalInMinutes = intervalInMinutes;
		this.#scanStartTimestamp = options.scanStartTimestamp !== null
			&& options.scanStartTimestamp !== undefined
			&& Number.isFinite(Number(options.scanStartTimestamp))
			? Number(options.scanStartTimestamp)
			: null;
		this.#avgBlockTimeSeconds = options.avgBlockTimeSeconds || {};
	}

	static #getNameAndDataFromInput(input, type, { quiet = false } = {}) {
		const metaForDecode = eventsForV1[type];
		if (!metaForDecode) {
			if (!quiet)
				console.log(`[ContractRunnerForV1] unsupported contract type ${type}`);
			return { name: null, data: null };
		}

		if (!input || typeof input !== 'string') {
			if (!quiet)
				console.log(`[ContractRunnerForV1] missing input for type ${type}`);
			return { name: null, data: null };
		}

		const event = metaForDecode.events.find(v => input.startsWith(v.sighash));
		if (!event) {
			if (!quiet)
				console.log(`[ContractRunnerForV1] unsupported input for type ${type}`);
			return { name: null, data: null };
		}

		const data = metaForDecode.iface.decodeFunctionData(event.name, input);
		return {
			name: event.name,
			data,
		}
	}

	setProvider(name, provider) {
		this.#providers[name] = provider;
	}

	setContracts(network, contracts) {
		this.#contracts[network] = contracts;
		this.#delayedExec();
	}

	#scheduleExec() {
		this.#exec().catch((error) => {
			console.error('[ContractRunnerForV1] scheduled execution failed', error);
		});
	}

	async #delayedExec(timeInSeconds = 30) {
		const unlock = await mutex.lockOrSkip('ContractManagerOfV1.delayedExec');
		if (!unlock) {
			return;
		}

		await sleep(timeInSeconds);
		this.#scheduleExec();

		if (!this.#intervalInitialized) {
			setInterval(() => {
				this.#scheduleExec();
			}, this.#intervalInMinutes * 60 * 1000);
			this.#intervalInitialized = true;
		}

		unlock();
	}

	#selectCandidateCall(candidates, contractType) {
		const sortedCandidates = [...candidates].sort(compareCandidateCalls);
		for (let i = 0; i < sortedCandidates.length; i++) {
			const candidate = sortedCandidates[i];
			const { name } = ContractRunnerForV1.#getNameAndDataFromInput(candidate.input, contractType, { quiet: true });
			if (name)
				return candidate;
		}

		return null;
	}

	async #getCandidateCalls(chain, contract, lastBlock, r = 0) {
		try {
			const transactions = await getAddressTransactions(chain, contract.address, lastBlock);
			const entries = transactions.map((transaction) => ({
				transaction,
				candidate: this.#selectCandidateCall(
					extractContractCallCandidatesFromMoralisTransaction(transaction, contract.address),
					contract.type
				),
			}));
			return entries;
		} catch (e) {
			if (!r || r <= 2) {
				await sleep(2);
				return this.#getCandidateCalls(chain, contract, lastBlock, !r ? 1 : ++r);
			}
			throw e;
		}
	}

	#getBootstrapStartTimestamp() {
		if (this.#scanStartTimestamp !== null)
			return this.#scanStartTimestamp;

		return Math.floor(Date.now() / 1000) - (DEFAULT_BOOTSTRAP_LOOKBACK_DAYS * SECONDS_IN_DAY);
	}

	async #getBootstrapStartBlock(network) {
		const startTimestamp = this.#getBootstrapStartTimestamp();
		const cacheKey = `${network}:${startTimestamp}`;
		if (this.#bootstrapStartBlocks[cacheKey] !== undefined)
			return this.#bootstrapStartBlocks[cacheKey];

		const provider = this.#providers[network];
		if (!provider)
			throw new Error(`[ContractRunnerForV1] missing provider for ${network} bootstrap scan`);

		const avgBlockTimeSeconds = this.#avgBlockTimeSeconds[network];
		const range = await getRangeByStartTimestamp(provider, {
			startTimestamp,
			avgBlockTimeSeconds,
		});
		if (!range)
			return 0;

		this.#bootstrapStartBlocks[cacheKey] = range.fromBlock;
		return range.fromBlock;
	}

	static #getTransactionTimestamp(transaction) {
		const rawTimestamp = transaction?.block_timestamp;
		if (rawTimestamp === undefined || rawTimestamp === null || rawTimestamp === '')
			return null;

		const numericTimestamp = Number(rawTimestamp);
		if (Number.isFinite(numericTimestamp))
			return numericTimestamp > 1e12 ? Math.floor(numericTimestamp / 1000) : numericTimestamp;

		const parsedTimestamp = Date.parse(rawTimestamp);
		if (!Number.isFinite(parsedTimestamp))
			return null;

		return Math.floor(parsedTimestamp / 1000);
	}

	async #prepareEventFromInput(network, candidateCall, contract) {
		const { input, from_address, hash } = candidateCall;
		const { type, name: contract_name, address, meta } = contract;

		const { name, data } = ContractRunnerForV1.#getNameAndDataFromInput(input, type);
		if (!name) return;

		let event = {
			aa_address: address,
			trigger_address: from_address,
			trigger_unit: hash,
			name: contract_name,
		}

		if (name.startsWith('deposit')) {
			const transactions = await getInternalTransactions(meta.network, hash);
			const transfer = selectFirstSuccessfulInternalTransaction(transactions);
			if (!transfer) {
				console.log(`[ContractRunnerForV1] missing deposit transfers for ${meta.network}:${hash}`);
				return 'err';
			}

			event.type = 'deposit';
			event.amount = transfer.value.toString();

			return event;
		}

		if (name.startsWith("withdraw")) {
			const transactions = await getInternalTransactions(meta.network, hash);
			const transfer = selectFirstSuccessfulInternalTransaction(transactions);
			if (!transfer) {
				console.log(`[ContractRunnerForV1] missing withdrawal transfers for ${meta.network}:${hash}`);
				return 'err';
			}

			event.type = 'withdraw';
			event.amount = transfer.value.toString();

			return event;
		}

		if (name === "voteAndDeposit" || name === "vote") {
			const governance = new ethers.Contract(meta.governance_address, getAbiByType('governance'), this.#providers[network]);
			const balance = await withRateLimitRetry(
				`ContractRunnerForV1.balances:${meta.network}:${meta.governance_address}`,
				() => governance.balances(from_address)
			);

			const c = new ethers.Contract(address, getAbiByType(type), this.#providers[network]);
			const {
				leader_value,
				leader_support,
				support,
				value,
			} = type === 'UintArray'
				? await DataFetcher.fetchVotedArrayData(c, data)
				: await DataFetcher.fetchVotedData(c, data);

			event.type = "added_support";
			event.added_support = balance.toString();
			event.leader_support = leader_support.toString();
			event.leader_value = Formatter.format(contract_name, leader_value, meta);
			event.value = Formatter.format(contract_name, value, meta);
			event.support = support.toString();

			return event;
		}

		if (name === 'unvote') {
			const c = new ethers.Contract(address, getAbiByType(type), this.#providers[network]);
			const {
				leader_value,
				leader_support,
			} = type === 'UintArray'
				? await DataFetcher.fetchVotedArrayData(c, null)
				: await DataFetcher.fetchVotedData(c, null);
			event.type = 'removed_support';
			event.leader_support = leader_support.toString();
			event.leader_value = Formatter.format(contract_name, leader_value, meta);

			return event;
		}
	}

	async #exec() {
		const unlock = await mutex.lockOrSkip('ContractManagerOfV1.exec');
		if (!unlock)
			return;

		for (let network in this.#contracts) {
			const c = this.#contracts[network];
			if (!c || !c.length) continue;

			for (let i = 0; i < c.length; i++) {
				const contract = c[i];
				const meta = contract.meta;
				const cursorState = await Web3_addresses.getLastBlockState(meta.network, contract.address);
				let lastBlock = cursorState.lastBlock;
				const bootstrapStartTimestamp = cursorState.exists ? null : this.#getBootstrapStartTimestamp();
				if (!cursorState.exists) {
					lastBlock = await this.#getBootstrapStartBlock(network);
					await Web3_addresses.setLastBlock(meta.network, contract.address, lastBlock);
				}
				
				const transactionEntries = await this.#getCandidateCalls(network, contract, lastBlock);

				if (transactionEntries.length) {
					let processedCount = 0;
					for (let j = 0; j < transactionEntries.length; j++) {
						const { transaction, candidate } = transactionEntries[j];
						const transactionTimestamp = ContractRunnerForV1.#getTransactionTimestamp(transaction);
						if (bootstrapStartTimestamp !== null) {
							if (transactionTimestamp === null)
								throw new Error(`[ContractRunnerForV1] missing block_timestamp for ${meta.network}:${transaction.hash}`);

							if (transactionTimestamp < bootstrapStartTimestamp) {
								processedCount++;
								continue;
							}
						}

						if (candidate) {
							const event = await this.#prepareEventFromInput(network, candidate, contract);
							if (event === 'err')
								break;

							if (event) {
								const dedupeRef = GovernanceEventDedupe.createEvmTxRef({
									network: meta.network,
									contractAddress: contract.address,
									txHash: candidate.hash,
									source: 'evm_v1_tx',
									eventType: event.type,
								});
								await Discord.announceEvent(meta, event, dedupeRef);
							}
						}

						processedCount++;
					}

					const lastFullyProcessedBlock = getLastFullyProcessedBlock(
						transactionEntries.map(({ transaction }) => transaction),
						processedCount
					);
					if (lastFullyProcessedBlock !== null) {
						await Web3_addresses.setLastBlock(meta.network, contract.address, lastFullyProcessedBlock + 1);
					}
				}
				await sleep(2);
			}
		}
		unlock();
	}
}

module.exports = ContractRunnerForV1;
