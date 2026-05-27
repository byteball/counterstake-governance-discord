const { eventsForV1 } = require('../eventsForV1');
const conf = require('ocore/conf');
const mutex = require('ocore/mutex');
const Web3AddressCursors = require('../../db/Web3AddressCursors');
const EventPublisher = require('./EventPublisher');
const { getAddressTransactions } = require('../api/getAddressTransactions');
const crashOnError = require('../../utils/crashOnError');
const { watchForDeadlock } = require('../../utils/deadlockMonitor');

const EMPTY_SCAN_LAG_BLOCKS = 1000;
const SCAN_LOCK = 'AddressEventScanner.scanAllNetworks';

watchForDeadlock(SCAN_LOCK);

function getValidScanStartDate(value) {
	const date = new Date(value);
	if (!value || Number.isNaN(date.getTime())) {
		throw Error('scan_start_date is required and must be a valid date');
	}
	return date;
}

function normalizeEventTimestamp(value) {
	if (value === null || value === undefined || value === '') return null;

	if (typeof value === 'number' || (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim()))) {
		const numericTimestamp = Number(value);
		if (!Number.isFinite(numericTimestamp) || numericTimestamp <= 0) return null;
		return Math.floor(numericTimestamp > 1e12 ? numericTimestamp / 1000 : numericTimestamp);
	}

	const dateTimestamp = Date.parse(value);
	if (Number.isNaN(dateTimestamp)) return null;
	return Math.floor(dateTimestamp / 1000);
}

class AddressEventScanner {
	#contracts = {};
	#providers = {};
	#intervalInHours;
	#intervalInitialized = false;
	#scanStartDate;
	#startupScannedNetworks = new Set();
	#startupScanPromises = {};
	#headBlockCache = {};

	constructor() {
		this.#intervalInHours = Number(conf.address_scan_interval_hours || 12);
		this.#scanStartDate = getValidScanStartDate(conf.scan_start_date);
	}

	setProvider(network, provider) {
		this.#providers[network] = provider;
	}

	setContracts(network, contracts) {
		this.#contracts[network] = contracts || [];
	}

	startInterval() {
		if (!this.#intervalInitialized) {
			setInterval(() => {
				this.scanAllNetworks().catch(e => crashOnError('address event scan interval failed', e));
			}, this.#intervalInHours * 60 * 60 * 1000);
			this.#intervalInitialized = true;
		}
	}

	static #findEventFromInput(input, type) {
		const metaForDecode = eventsForV1[type];
		if (!metaForDecode) {
			console.log('type not found', type, input);
			return { metaForDecode: null, event: null };
		}

		const event = metaForDecode.events.find(v => input && input.startsWith(v.sighash));
		if (!event) {
			console.log('event not found', type, input);
			return { metaForDecode, event: null };
		}

		return { metaForDecode, event };
	}

	static #getNameAndDataFromInput(input, type) {
		const { metaForDecode, event } = AddressEventScanner.#findEventFromInput(input, type);
		if (!event) return { name: null, data: null };

		const data = metaForDecode.iface.decodeFunctionData(event.name, input);
		return {
			name: event.name,
			data,
		};
	}

	async #prepareEventFromInput(network, transaction, contract) {
		const { input, from_address, hash } = transaction;
		const { type, name: contractName, address, meta } = contract;

		const { name, data } = AddressEventScanner.#getNameAndDataFromInput(input, type);
		if (!name) return null;

		const event = {
			aa_address: address,
			trigger_address: from_address,
			trigger_unit: hash,
			name: contractName,
		};
		const timestamp = normalizeEventTimestamp(transaction.timestamp);
		if (timestamp) {
			event.timestamp = timestamp;
		}

		if (name.startsWith('deposit')) {
			const internal = transaction.internal_transactions[0];
			if (!internal) {
				console.log('transactions not found(deposit)', meta.network, hash);
				return 'err';
			}
			event.type = 'deposit';
			event.amount = internal.value.toString();
			return event;
		}

		if (name.startsWith('withdraw')) {
			const internal = transaction.internal_transactions[0];
			if (!internal) {
				console.log('transactions not found(withdraw)', meta.network, hash);
				return 'err';
			}
			event.type = 'withdraw';
			event.amount = internal.value.toString();
			return event;
		}

		if (name === 'voteAndDeposit' || name === 'vote') {
			const { ethers } = require('ethers');
			const { getAbiByType } = require('../abi/getAbiByType');
			const DataFetcher = require('./DataFetcher');
			const Formatter = require('./Formatter');
			const governance = new ethers.Contract(meta.governance_address, getAbiByType('governance'), this.#providers[network]);
			const balance = await governance.balances(from_address);

			const c = new ethers.Contract(address, getAbiByType(type), this.#providers[network]);
			const {
				leader_value,
				leader_support,
				support,
				value,
			} = type === 'UintArray' ? await DataFetcher.fetchVotedArrayData(c, data) : await DataFetcher.fetchVotedData(c, data);

			event.type = 'added_support';
			event.added_support = balance.toString();
			event.leader_support = leader_support.toString();
			event.leader_value = Formatter.format(contractName, leader_value, meta);
			event.value = Formatter.format(contractName, value, meta);
			event.support = support.toString();

			return event;
		}

		if (name === 'unvote') {
			const { ethers } = require('ethers');
			const { getAbiByType } = require('../abi/getAbiByType');
			const DataFetcher = require('./DataFetcher');
			const Formatter = require('./Formatter');
			const c = new ethers.Contract(address, getAbiByType(type), this.#providers[network]);
			const {
				leader_value,
				leader_support,
			} = type === 'UintArray' ? await DataFetcher.fetchVotedArrayData(c) : await DataFetcher.fetchVotedData(c);
			event.type = 'removed_support';
			event.leader_support = leader_support.toString();
			event.leader_value = Formatter.format(contractName, leader_value, meta);

			return event;
		}

		return null;
	}

	#transactionNeedsInternalData(transaction, type) {
		const { event } = AddressEventScanner.#findEventFromInput(transaction.input, type);
		return !!event && (event.name.startsWith('deposit') || event.name.startsWith('withdraw'));
	}

	async #getLaggedHeadCursor(network, currentCursor) {
		const provider = this.#providers[network];
		if (!provider || typeof provider.getBlockNumber !== 'function') {
			return 0;
		}
		if (!this.#headBlockCache[network]) {
			this.#headBlockCache[network] = await provider.getBlockNumber();
		}
		const headBlock = this.#headBlockCache[network];
		const cursor = Math.max(0, Number(headBlock) - EMPTY_SCAN_LAG_BLOCKS);
		if (!Number.isFinite(cursor) || cursor <= Number(currentCursor || 0)) {
			return 0;
		}
		return cursor;
	}

	async #getTargetTransactions(network, contract, fromBlock, hasCursor) {
		return (await getAddressTransactions(network, contract.address, fromBlock, {
			fromDate: hasCursor ? null : this.#scanStartDate.toISOString(),
			shouldFetchInternalTransactions: (tx) => this.#transactionNeedsInternalData(tx, contract.type),
		}))
			.filter(tx => tx.to_address && tx.to_address.toLowerCase() === contract.address.toLowerCase())
			.sort((a, b) => a.block_number - b.block_number);
	}

	#selectTransactionsToPublish(targetTransactions, hasCursor) {
		const transactionsToPublish = [];
		let cursorBlock = 0;
		for (const transaction of targetTransactions) {
			if (hasCursor) {
				transactionsToPublish.push(transaction);
				continue;
			}
			const timestamp = new Date(transaction.timestamp);
			if (!Number.isNaN(timestamp.getTime()) && timestamp > this.#scanStartDate) {
				transactionsToPublish.push(transaction);
			} else {
				cursorBlock = Math.max(cursorBlock, Number(transaction.block_number));
			}
		}
		return { transactionsToPublish, cursorBlock };
	}

	async #publishTransactions(network, contract, transactionsToPublish, cursorBlock) {
		for (const transaction of transactionsToPublish) {
			const event = await this.#prepareEventFromInput(network, transaction, contract);
			console.log('scanned event:', event, transaction.hash);
			if (!event) {
				cursorBlock = Math.max(cursorBlock, Number(transaction.block_number));
				continue;
			}
			if (event === 'err') break;
			await EventPublisher.publish(contract.meta, event, 'scan');
			cursorBlock = Math.max(cursorBlock, Number(transaction.block_number));
		}
		return cursorBlock;
	}

	async #saveScanCursor(network, contract, currentCursor, cursorBlock, transactionsToPublish) {
		if (!cursorBlock && !transactionsToPublish.length) {
			const laggedHeadCursor = await this.#getLaggedHeadCursor(network, currentCursor);
			if (laggedHeadCursor) {
				await Web3AddressCursors.setLastBlock(network, contract.address, laggedHeadCursor);
			}
			return;
		}

		if (cursorBlock) {
			await Web3AddressCursors.setLastBlock(network, contract.address, cursorBlock + 1);
		}
	}

	async #scanContract(network, contract) {
		const currentCursor = await Web3AddressCursors.getLastBlock(network, contract.address);
		const hasCursor = currentCursor !== null && currentCursor !== undefined;
		const fromBlock = hasCursor ? currentCursor : 0;
		const targetTransactions = await this.#getTargetTransactions(network, contract, fromBlock, hasCursor);
		const {
			transactionsToPublish,
			cursorBlock: bootstrapCursorBlock,
		} = this.#selectTransactionsToPublish(targetTransactions, hasCursor);
		const cursorBlock = await this.#publishTransactions(network, contract, transactionsToPublish, bootstrapCursorBlock);
		await this.#saveScanCursor(network, contract, currentCursor, cursorBlock, transactionsToPublish);
	}

	async scanAllNetworks() {
		const unlock = await mutex.lockOrSkip(SCAN_LOCK);
		if (!unlock) return;

		try {
			this.#headBlockCache = {};
			console.log('address event scan start', (new Date()).toISOString());
			for (const network of Object.keys(this.#contracts)) {
				const contracts = this.#contracts[network];
				if (!contracts || !contracts.length) continue;
				for (const contract of contracts) {
					await this.#scanContract(network, contract);
				}
			}
			console.log('address event scan done', (new Date()).toISOString());
		} finally {
			unlock();
		}
	}

	async #scanNetwork(network) {
		const unlock = await mutex.lock(SCAN_LOCK);

		try {
			delete this.#headBlockCache[network];
			console.log('address event scan network start', network, (new Date()).toISOString());
			const contracts = this.#contracts[network];
			if (!contracts || !contracts.length) return;
			for (const contract of contracts) {
				await this.#scanContract(network, contract);
			}
			console.log('address event scan network done', network, (new Date()).toISOString());
		} finally {
			unlock();
		}
	}

	async scanNetworkOnce(network) {
		if (this.#startupScannedNetworks.has(network)) return true;
		if (this.#startupScanPromises[network]) return this.#startupScanPromises[network];

		this.#startupScanPromises[network] = (async () => {
			if (this.#startupScannedNetworks.has(network)) return true;
			const contracts = this.#contracts[network];
			if (!contracts || !contracts.length) return false;
			await this.#scanNetwork(network);
			this.#startupScannedNetworks.add(network);
			return true;
		})();

		try {
			return await this.#startupScanPromises[network];
		} finally {
			delete this.#startupScanPromises[network];
		}
	}
}

module.exports = AddressEventScanner;
