const axios = require('axios');
const sleep = require('../../utils/sleep');

const MORALIS_LIMIT = 100;
const MINTSCAN_OFFSET = 100;
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_RETRY_DELAY_MS = 2000;

function getMoralisChainName(chain) {
	switch (chain) {
		case 'Ethereum':
			return process.env.testnet ? 'sepolia' : 'eth';
		case 'BSC':
			return process.env.testnet ? 'bsc testnet' : 'bsc';
		case 'Polygon':
			return process.env.testnet ? 'polygon amoy' : 'polygon';
	}
	throw Error(`unknown Moralis chain ${chain}`);
}

async function requestWithRetry(fn, logContext) {
	let attempt = 0;
	for (;;) {
		try {
			return await fn();
		} catch (e) {
			const status = e.response?.status;
			if (status >= 400 && status < 500 && status !== 429) {
				throw e;
			}
			if (attempt >= DEFAULT_MAX_RETRIES) {
				console.log(`${logContext} failed after ${attempt + 1} attempts`, e);
				throw e;
			}
			attempt += 1;
			console.log(`${logContext} retry`, attempt, e.message || e);
			await sleep(DEFAULT_RETRY_DELAY_MS / 1000);
		}
	}
}

function normalizeBlockNumber(value) {
	const block = Number(value);
	if (!Number.isFinite(block)) {
		throw Error(`bad block number ${value}`);
	}
	return block;
}

function normalizeTraceId(value) {
	if (value === undefined || value === null) return null;
	return String(value);
}

function normalizeMoralisTransaction(tx) {
	return {
		hash: tx.hash,
		block_number: normalizeBlockNumber(tx.block_number),
		timestamp: tx.block_timestamp,
		from_address: tx.from_address,
		to_address: tx.to_address,
		input: tx.input,
		value: tx.value,
		internal_transactions: Array.isArray(tx.internal_transactions)
			? tx.internal_transactions.map((internal, index) => normalizeMoralisInternalTransaction(internal, index))
			: [],
	};
}

function normalizeMoralisInternalTransaction(tx, index) {
	const hash = tx.transaction_hash || tx.hash;
	return {
		transaction_hash: hash,
		hash,
		block_number: tx.block_number,
		value: tx.value,
		from: tx.from,
		to: tx.to,
		input: tx.input || '0x',
		trace_id: normalizeTraceId(tx.trace_id ?? tx.traceId ?? `moralis-${index}`),
		type: tx.type,
		status: tx.status,
		error: tx.error,
	};
}

function getMoralisUrl(chain, address, fromBlock, cursor, options) {
	const params = new URLSearchParams({
		chain: getMoralisChainName(chain),
		order: 'ASC',
		limit: String(MORALIS_LIMIT),
		include: 'internal_transactions',
	});
	if (options.fromDate) {
		params.set('from_date', options.fromDate);
	} else {
		params.set('from_block', String(fromBlock || 0));
	}
	if (cursor) {
		params.set('cursor', cursor);
	}
	return `https://deep-index.moralis.io/api/v2.2/${address}?${params.toString()}`;
}

async function getMoralisAddressTransactions(chain, address, fromBlock, options) {
	let cursor = null;
	const transactions = [];
	const seenCursors = new Set();

	do {
		const url = getMoralisUrl(chain, address, fromBlock, cursor, options);
		const response = await requestWithRetry(
			() => axios.get(url, { headers: { 'X-API-Key': process.env.moralis_api_key } }),
			`moralis address transactions ${chain} ${address}`
		);
		if (!Array.isArray(response.data?.result)) {
			throw Error(`bad response from Moralis for ${chain} ${address}: ${JSON.stringify(response.data)}`);
		}
		transactions.push(...response.data.result.map(normalizeMoralisTransaction));
		cursor = response.data.cursor || null;
		if (cursor) {
			if (seenCursors.has(cursor)) {
				throw Error(`repeated Moralis cursor for ${chain} ${address}: ${cursor}`);
			}
			seenCursors.add(cursor);
		}
	} while (cursor);

	return transactions.sort((a, b) => a.block_number - b.block_number);
}

function getMintscanData(response) {
	if (Array.isArray(response.data)) return response.data;
	throw Error(`bad response from Mintscan: ${JSON.stringify(response.data)}`);
}

function normalizeMintscanTransaction(tx) {
	const hash = tx.tx_hash || tx.txHash || tx.hash || tx.transaction_hash || tx.transactionHash;
	if (!hash) {
		throw Error(`missing Mintscan transaction hash: ${JSON.stringify(tx)}`);
	}
	return {
		hash,
		block_number: normalizeBlockNumber(tx.block_height ?? tx.blockHeight ?? tx.block_number ?? tx.blockNumber ?? tx.height),
		transaction_index: tx.transactionIndex ?? tx.transaction_index,
		timestamp: tx.timestamp ?? tx.block_timestamp ?? tx.blockTimestamp,
		from_address: tx.from ?? tx.from_address ?? tx.fromAddress,
		to_address: tx.to ?? tx.to_address ?? tx.toAddress,
		input: tx.input ?? tx.data ?? '0x',
		value: tx.value,
		internal_transactions: [],
	};
}

function normalizeMintscanInternalTransaction(tx) {
	const hash = tx.tx_hash || tx.txHash || tx.hash || tx.transaction_hash || tx.transactionHash;
	return {
		transaction_hash: hash || null,
		hash: hash || null,
		block_number: tx.blockNumber ?? tx.block_number ?? tx.block_height ?? tx.blockHeight ?? tx.height,
		transaction_index: tx.transactionIndex ?? tx.transaction_index,
		value: tx.value,
		from: tx.from ?? tx.from_address ?? tx.fromAddress,
		to: tx.to ?? tx.to_address ?? tx.toAddress,
		input: tx.input ?? tx.data ?? '0x',
		trace_id: normalizeTraceId(tx.traceId ?? tx.trace_id),
		type: tx.type,
		status: tx.status,
	};
}

function getMintscanBlockIndexKey(blockNumber, transactionIndex) {
	if (blockNumber === undefined || blockNumber === null || transactionIndex === undefined || transactionIndex === null) {
		return null;
	}
	return `block:${normalizeBlockNumber(blockNumber)}:index:${transactionIndex}`;
}

function getMintscanInternalGroupKey(row) {
	if (row.transaction_hash) return `hash:${row.transaction_hash}`;
	return getMintscanBlockIndexKey(row.block_number, row.transaction_index);
}

function getMintscanUrl(path, address, fromBlock, page) {
	const params = new URLSearchParams({
		address,
		page: String(page),
		offset: String(MINTSCAN_OFFSET),
		sort: 'asc',
		start_block: String(fromBlock || 1),
	});
	return `https://apis.mintscan.io/v1/evm/kava/${path}?${params.toString()}`;
}

async function getMintscanPages(path, address, fromBlock) {
	const rows = [];
	let page = 1;

	for (;;) {
		const url = getMintscanUrl(path, address, fromBlock, page);
		const response = await requestWithRetry(
			() => axios.get(url, { headers: { Authorization: `Bearer ${process.env.mintscan_api_key}` } }),
			`mintscan ${path} ${address}`
		);
		const data = getMintscanData(response);
		rows.push(...data);
		if (data.length < MINTSCAN_OFFSET) {
			break;
		}
		page += 1;
	}

	return rows;
}

async function getMintscanAddressTransactions(address, fromBlock) {
	const [txRows, internalRows] = await Promise.all([
		getMintscanPages('account/tx', address, fromBlock),
		getMintscanPages('account/internal-tx', address, fromBlock),
	]);

	const transactionsByKey = new Map();
	for (const transaction of txRows.map(normalizeMintscanTransaction)) {
		transactionsByKey.set(`hash:${transaction.hash}`, transaction);
		const blockIndexKey = getMintscanBlockIndexKey(transaction.block_number, transaction.transaction_index);
		if (blockIndexKey && !transactionsByKey.has(blockIndexKey)) {
			transactionsByKey.set(blockIndexKey, transaction);
		}
	}

	const internalByHash = new Map();
	for (const row of internalRows.map(normalizeMintscanInternalTransaction)) {
		const key = getMintscanInternalGroupKey(row);
		if (!key) {
			console.log('skip Mintscan internal transaction without hash or block/index', row);
			continue;
		}
		if (!internalByHash.has(key)) {
			internalByHash.set(key, []);
		}
		internalByHash.get(key).push(row);
	}

	for (const [key, rows] of internalByHash) {
		const hash = rows[0].transaction_hash;
		let transaction = transactionsByKey.get(key);
		if (!transaction) {
			const first = rows[0];
			transaction = {
				hash,
				block_number: normalizeBlockNumber(first.block_number),
				transaction_index: first.transaction_index,
				timestamp: null,
				from_address: first.from,
				to_address: first.to,
				input: '0x',
				value: first.value,
				internal_transactions: [],
			};
			transactionsByKey.set(key, transaction);
		}
		transaction.internal_transactions = rows;
	}

	return [...new Set(transactionsByKey.values())].sort((a, b) => a.block_number - b.block_number);
}

async function getAddressTransactions(chain, address, fromBlock, options = {}) {
	if (chain === 'Kava') {
		return getMintscanAddressTransactions(address, fromBlock);
	}
	return getMoralisAddressTransactions(chain, address, fromBlock, options);
}

module.exports = {
	getAddressTransactions,
};
