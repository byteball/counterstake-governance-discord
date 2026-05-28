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

function getScanIntervalInHours(value) {
	const normalized = typeof value === 'string'
		? value.trim().replace(/^["'](.+)["']$/, '$1')
		: value;
	const interval = Number(normalized);
	if (Number.isFinite(interval) && interval > 0) {
		return interval;
	}
	console.warn('invalid address_scan_interval_hours, using default 12 hours', value);
	return 12;
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
		this.#intervalInHours = getScanIntervalInHours(conf.address_scan_interval_hours || 12);
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

	static #sameAddress(a, b) {
		return !!a && !!b && String(a).toLowerCase() === String(b).toLowerCase();
	}

	static #hasDecodableInput(input) {
		return !!input && input !== '0x';
	}

	static #extractCallCandidates(transaction, contract) {
		const candidates = [];
		const { address } = contract;

		if (
			AddressEventScanner.#sameAddress(transaction.to_address, address)
			&& AddressEventScanner.#hasDecodableInput(transaction.input)
		) {
			candidates.push({ ...transaction, candidate_source: 'external' });
		}

		const internalTransactions = transaction.internal_transactions || [];
		internalTransactions.forEach((internal) => {
			if (!AddressEventScanner.#sameAddress(internal.to, address)) return;
			if (!AddressEventScanner.#hasDecodableInput(internal.input)) return;
			if (internal.status !== undefined && internal.status !== null && String(internal.status) !== '1') return;
			if (internal.error) return;
			if (
				AddressEventScanner.#sameAddress(internal.from, transaction.from_address)
				&& AddressEventScanner.#sameAddress(internal.to, transaction.to_address)
				&& internal.input === transaction.input
			) return;

			const traceId = internal.trace_id === undefined || internal.trace_id === null ? null : String(internal.trace_id);
			if (traceId === null || traceId === '') return;
			const candidate = {
				...transaction,
				candidate_key: `${transaction.hash}:internal:${traceId}`,
				candidate_source: 'internal',
				block_number: transaction.block_number,
				timestamp: transaction.timestamp,
				from_address: internal.from || transaction.from_address,
				to_address: internal.to,
				input: internal.input,
				value: internal.value,
				internal_transactions: [internal],
			};
			candidates.push(candidate);
		});

		return candidates;
	}

	async #prepareEventFromInput(network, transaction, contract) {
		const { input, from_address, hash } = transaction;
		const { type, name: contractName, address, meta } = contract;
		if (!hash) {
			console.log('transaction hash not found for scanned candidate', meta.network, transaction.block_number, transaction.transaction_index);
			return 'err';
		}

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
		if (transaction.candidate_key) {
			event.candidate_key = transaction.candidate_key;
		}
		if (transaction.candidate_source) {
			event.candidate_source = transaction.candidate_source;
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

	async #fillMissingCandidateMetadata(network, candidates) {
		const provider = this.#providers[network];
		if (!provider || typeof provider.getBlock !== 'function') return;

		const blockPromises = new Map();

		for (const candidate of candidates) {
			if (normalizeEventTimestamp(candidate.timestamp) && candidate.hash) continue;
			const blockNumber = Number(candidate.block_number);
			if (!Number.isFinite(blockNumber)) continue;
			if (!blockPromises.has(blockNumber)) {
				blockPromises.set(blockNumber, provider.getBlock(blockNumber, true).catch(e => {
					console.log('failed to load block metadata', network, blockNumber, e && e.message ? e.message : e);
					return null;
				}));
			}
			const block = await blockPromises.get(blockNumber);
			if (block && block.timestamp) {
				candidate.timestamp = block.timestamp;
			}
			if (!candidate.hash && candidate.transaction_index !== undefined && candidate.transaction_index !== null) {
				const transactionIndex = Number(candidate.transaction_index);
				const transaction = block && Number.isInteger(transactionIndex)
					? (block.prefetchedTransactions && block.prefetchedTransactions[transactionIndex])
						|| (block.transactions && block.transactions[transactionIndex])
					: null;
				const hash = typeof transaction === 'string' ? transaction : transaction && transaction.hash;
				if (hash) {
					candidate.hash = hash;
					const internal = candidate.internal_transactions[0];
					if (internal) {
						internal.hash = hash;
						internal.transaction_hash = hash;
						candidate.candidate_key = `${hash}:internal:${internal.trace_id}`;
					}
				}
			}
		}
	}

	async #getTargetCandidates(network, contract, fromBlock, hasCursor) {
		const candidates = (await getAddressTransactions(network, contract.address, fromBlock, {
			fromDate: hasCursor ? null : this.#scanStartDate.toISOString(),
			shouldFetchInternalTransactions: (tx) => this.#transactionNeedsInternalData(tx, contract.type),
		}))
			.flatMap(tx => AddressEventScanner.#extractCallCandidates(tx, contract))
			.sort((a, b) => {
				const blockDiff = Number(a.block_number) - Number(b.block_number);
				if (blockDiff) return blockDiff;
				return String(a.candidate_key || '').localeCompare(String(b.candidate_key || ''));
			});
		await this.#fillMissingCandidateMetadata(network, candidates);
		return candidates;
	}

	#selectCandidatesToPublish(targetCandidates, hasCursor) {
		const candidatesToPublish = [];
		let cursorBlock = 0;
		let firstInvalidTimestampBlock = null;
		for (const candidate of targetCandidates) {
			if (hasCursor) {
				candidatesToPublish.push(candidate);
				continue;
			}
			const timestamp = normalizeEventTimestamp(candidate.timestamp);
			if (!timestamp) {
				const blockNumber = Number(candidate.block_number);
				if (Number.isFinite(blockNumber)) {
					firstInvalidTimestampBlock = firstInvalidTimestampBlock === null
						? blockNumber
						: Math.min(firstInvalidTimestampBlock, blockNumber);
				}
				continue;
			}
			if (timestamp > Math.floor(this.#scanStartDate.getTime() / 1000)) {
				candidatesToPublish.push(candidate);
			} else {
				cursorBlock = Math.max(cursorBlock, Number(candidate.block_number));
			}
		}
		return { candidatesToPublish, cursorBlock, firstInvalidTimestampBlock };
	}

	async #publishCandidates(network, contract, candidatesToPublish, cursorBlock) {
		let failedBlock = null;
		for (const candidate of candidatesToPublish) {
			const event = await this.#prepareEventFromInput(network, candidate, contract);
			console.log('scanned event:', event, candidate.hash);
			if (!event) {
				cursorBlock = Math.max(cursorBlock, Number(candidate.block_number));
				continue;
			}
			if (event === 'err') {
				failedBlock = Number(candidate.block_number);
				break;
			}
			await EventPublisher.publish(contract.meta, event, 'scan');
			cursorBlock = Math.max(cursorBlock, Number(candidate.block_number));
		}
		return { cursorBlock, failedBlock };
	}

	async #saveScanCursor(network, contract, currentCursor, cursorBlock, candidatesToPublish, firstUnsafeBlock) {
		if (firstUnsafeBlock !== null) {
			const safeCursorBlock = Math.min(cursorBlock, firstUnsafeBlock - 1);
			if (safeCursorBlock > 0) {
				await Web3AddressCursors.setLastBlock(network, contract.address, safeCursorBlock + 1);
			}
			return;
		}

		if (!cursorBlock && !candidatesToPublish.length) {
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
		const targetCandidates = await this.#getTargetCandidates(network, contract, fromBlock, hasCursor);
		const {
			candidatesToPublish,
			cursorBlock: bootstrapCursorBlock,
			firstInvalidTimestampBlock,
		} = this.#selectCandidatesToPublish(targetCandidates, hasCursor);
		const { cursorBlock, failedBlock } = await this.#publishCandidates(network, contract, candidatesToPublish, bootstrapCursorBlock);
		const unsafeBlocks = [firstInvalidTimestampBlock, failedBlock].filter(v => v !== null && Number.isFinite(v));
		const firstUnsafeBlock = unsafeBlocks.length ? Math.min(...unsafeBlocks) : null;
		await this.#saveScanCursor(network, contract, currentCursor, cursorBlock, candidatesToPublish, firstUnsafeBlock);
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
