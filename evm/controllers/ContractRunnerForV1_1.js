const conf = require('ocore/conf');
const mutex = require('ocore/mutex');
const { ethers } = require("ethers");

const V1_1 = require('../../db/V1_1');
const { getAbiByType } = require('../abi/getAbiByType');
const governanceHandlers = require('../eventHandlers/governance');
const uintHandlers = require('../eventHandlers/uint');
const uintArrayHandlers = require('../eventHandlers/uintArray');
const addressHandlers = require('../eventHandlers/address');

const REPLAY_INTERVAL = 12 * 60 * 60 * 1000;
const MAX_LOG_RANGE_BLOCKS = 5000;

function isBlockRangeTooLargeError(error) {
	const codes = [
		error?.code,
		error?.error?.code,
	];
	const message = [
		error?.error?.message,
		error?.shortMessage,
		error?.message,
		error,
	]
		.filter(Boolean)
		.join(' ');

	return codes.includes(-32062)
		|| codes.includes(35)
		|| /block range (is )?too large/i.test(message)
		|| /exceed(?:ed|s)? maximum block range/i.test(message)
		|| /ranges? over \d+ blocks? (?:are|is) not supported/i.test(message);
}

class ContractRunnerForV1_1 {
	#contracts = {};
	#providers = {};
	#bootstrapBlocks = {};
	#intervalInitialized = {};

	setProvider(network, provider) {
		this.#providers[network] = provider;
	}

	setContracts(network, contracts) {
		this.#contracts[network] = contracts || [];
		if (this.#intervalInitialized[network] || !this.#contracts[network].length) {
			return;
		}

		this.#exec(network);
		setInterval(this.#exec.bind(this, network), REPLAY_INTERVAL);
		this.#intervalInitialized[network] = true;
	}

	async #exec(network) {
		const unlock = await mutex.lockOrSkip(`ContractRunnerForV1_1.${network}`);
		if (!unlock) {
			return;
		}

		try {
			const provider = this.#providers[network];
			const contracts = this.#contracts[network];
			if (!provider || !contracts || !contracts.length) {
				return;
			}

			const latestHead = await provider.getBlockNumber();
			for (let i = 0; i < contracts.length; i++) {
				await this.#replayContract(network, provider, contracts[i], latestHead);
			}
		} catch (e) {
			if (isBlockRangeTooLargeError(e)) {
				console.error(`ContractRunnerForV1_1[${network}] retryable replay error:`, e);
				return;
			}

			console.error(`ContractRunnerForV1_1[${network}] failed:`, e);
			throw e;
		} finally {
			unlock();
		}
	}

	async #replayContract(network, provider, contract, latestHead) {
		const cursor = await V1_1.getCursor(network, contract.address);
		const fromBlock = cursor === null
			? await this.#getBootstrapBlock(network, provider, latestHead)
			: cursor + 1;

		if (fromBlock > latestHead) {
			return;
		}

		const c = new ethers.Contract(contract.address, getAbiByType(contract.type), provider);
		const specs = this.#getReplaySpecs(contract, provider);
		const entries = [];

		for (let i = 0; i < specs.length; i++) {
			const spec = specs[i];
			const logs = await this.#queryFilterInChunks(c, spec.eventName, fromBlock, latestHead);
			for (let j = 0; j < logs.length; j++) {
				entries.push({
					log: logs[j],
					handle: spec.handle,
				});
			}
		}

		entries.sort((a, b) => {
			if (a.log.blockNumber !== b.log.blockNumber) {
				return a.log.blockNumber - b.log.blockNumber;
			}
			return a.log.index - b.log.index;
		});

		for (let i = 0; i < entries.length; i++) {
			const entry = entries[i];
			await entry.handle(entry.log);
		}

		await V1_1.setCursor(network, contract.address, latestHead);
		await V1_1.deleteEventDedupeUpToBlock(network, contract.address, latestHead);
	}

	async #queryFilterInChunks(contract, eventName, fromBlock, toBlock) {
		if (fromBlock > toBlock) {
			return [];
		}

		if (toBlock - fromBlock + 1 > MAX_LOG_RANGE_BLOCKS) {
			const logs = [];
			for (let chunkFrom = fromBlock; chunkFrom <= toBlock; chunkFrom += MAX_LOG_RANGE_BLOCKS) {
				const chunkTo = Math.min(chunkFrom + MAX_LOG_RANGE_BLOCKS - 1, toBlock);
				logs.push(...await this.#queryFilterInChunks(contract, eventName, chunkFrom, chunkTo));
			}
			return logs;
		}

		try {
			return await contract.queryFilter(eventName, fromBlock, toBlock);
		} catch (e) {
			if (!isBlockRangeTooLargeError(e) || fromBlock >= toBlock) {
				throw e;
			}

			const middleBlock = Math.floor((fromBlock + toBlock) / 2);
			const leftLogs = await this.#queryFilterInChunks(contract, eventName, fromBlock, middleBlock);
			const rightLogs = await this.#queryFilterInChunks(contract, eventName, middleBlock + 1, toBlock);
			return leftLogs.concat(rightLogs);
		}
	}

	#getReplaySpecs(contract, provider) {
		switch (contract.type) {
			case 'governance':
				return [{
					eventName: 'Withdrawal',
					handle: async (log) => governanceHandlers.withdrawal(contract, ...log.args, log),
				}];

			case 'Uint':
				return [
					{
						eventName: 'Vote',
						handle: async (log) => uintHandlers.vote(contract, ...log.args, log),
					},
					{
						eventName: 'Unvote',
						handle: async (log) => uintHandlers.unvote(contract, provider, ...log.args, log),
					},
				];

			case 'UintArray':
				return [
					{
						eventName: 'Vote',
						handle: async (log) => uintArrayHandlers.vote(contract, ...log.args, log),
					},
					{
						eventName: 'Unvote',
						handle: async (log) => uintArrayHandlers.unvote(contract, provider, ...log.args, log),
					},
				];

			case 'address':
				return [
					{
						eventName: 'Vote',
						handle: async (log) => addressHandlers.vote(contract, ...log.args, log),
					},
					{
						eventName: 'Unvote',
						handle: async (log) => addressHandlers.unvote(contract, provider, ...log.args, log),
					},
				];
		}

		throw new Error(`Unknown v1_1 contract type ${contract.type}`);
	}

	async #getBootstrapBlock(network, provider, latestHead) {
		if (typeof this.#bootstrapBlocks[network] === 'number') {
			return this.#bootstrapBlocks[network];
		}

		const replayFromDate = conf.v1_1_replay_from_date;
		if (!/^\d{4}-\d{2}-\d{2}$/.test(replayFromDate || '')) {
			throw new Error(`Bad v1_1_replay_from_date: ${replayFromDate}`);
		}

		const targetTimestamp = Math.floor(Date.parse(`${replayFromDate}T00:00:00Z`) / 1000);
		const latestBlock = await provider.getBlock(latestHead);
		if (latestBlock.timestamp <= targetTimestamp) {
			this.#bootstrapBlocks[network] = latestHead;
			return latestHead;
		}

		let left = 0;
		let right = latestHead;
		let result = latestHead;
		while (left <= right) {
			const middle = Math.floor((left + right) / 2);
			const block = await provider.getBlock(middle);
			if (block.timestamp >= targetTimestamp) {
				result = middle;
				right = middle - 1;
			} else {
				left = middle + 1;
			}
		}

		this.#bootstrapBlocks[network] = result;
		return result;
	}
}

module.exports = ContractRunnerForV1_1;
