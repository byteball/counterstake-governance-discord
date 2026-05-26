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

function normalizeMoralisTransaction(tx) {
	return {
		hash: tx.hash,
		block_number: normalizeBlockNumber(tx.block_number),
		timestamp: tx.block_timestamp,
		from_address: tx.from_address,
		to_address: tx.to_address,
		input: tx.input,
		value: tx.value,
		internal_transactions: Array.isArray(tx.internal_transactions) ? tx.internal_transactions : [],
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
	return {
		hash: tx.tx_hash || tx.txHash || tx.hash || tx.transaction_hash || tx.transactionHash,
		block_number: normalizeBlockNumber(tx.block_height || tx.blockHeight || tx.block_number || tx.blockNumber || tx.height),
		timestamp: tx.timestamp || tx.block_timestamp || tx.blockTimestamp,
		from_address: tx.from || tx.from_address || tx.fromAddress,
		to_address: tx.to || tx.to_address || tx.toAddress,
		input: tx.input || tx.data || '0x',
		value: tx.value,
		internal_transactions: [],
	};
}

function normalizeMintscanInternalTransaction(tx) {
	return {
		transaction_hash: tx.tx_hash || tx.txHash || tx.hash || tx.transaction_hash || tx.transactionHash,
		value: tx.value,
		from: tx.from || tx.from_address || tx.fromAddress,
		to: tx.to || tx.to_address || tx.toAddress,
	};
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

function getMintscanInternalTransactionUrl(txhash) {
	const params = new URLSearchParams({ txhash });
	return `https://apis.mintscan.io/v1/evm/kava/internal-tx?${params.toString()}`;
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

async function getMintscanInternalTransactionsByHash(txhash) {
	const url = getMintscanInternalTransactionUrl(txhash);
	const response = await requestWithRetry(
		() => axios.get(url, { headers: { Authorization: `Bearer ${process.env.mintscan_api_key}` } }),
		`mintscan internal-tx ${txhash}`
	);
	return getMintscanData(response).map(normalizeMintscanInternalTransaction);
}

async function getMintscanAddressTransactions(address, fromBlock, options) {
	const txRows = await getMintscanPages('account/tx', address, fromBlock);
	const transactions = txRows.map(normalizeMintscanTransaction);
	const shouldFetchInternalTransactions = options.shouldFetchInternalTransactions || (() => true);
	const transactionsNeedingInternalData = transactions.filter(shouldFetchInternalTransactions);
	if (!transactionsNeedingInternalData.length) {
		return transactions.sort((a, b) => a.block_number - b.block_number);
	}

	const internalRows = transactionsNeedingInternalData.length === 1
		? await getMintscanInternalTransactionsByHash(transactionsNeedingInternalData[0].hash)
		: await getMintscanPages('account/internal-tx', address, fromBlock);
	const internalByHash = new Map();
	for (const row of internalRows.map(normalizeMintscanInternalTransaction)) {
		if (!internalByHash.has(row.transaction_hash)) {
			internalByHash.set(row.transaction_hash, []);
		}
		internalByHash.get(row.transaction_hash).push(row);
	}

	return transactions
		.map(tx => ({
			...tx,
			internal_transactions: internalByHash.get(tx.hash) || [],
		}))
		.sort((a, b) => a.block_number - b.block_number);
}

async function getAddressTransactions(chain, address, fromBlock, options = {}) {
	if (chain === 'Kava') {
		return getMintscanAddressTransactions(address, fromBlock, options);
	}
	return getMoralisAddressTransactions(chain, address, fromBlock, options);
}

module.exports = {
	getAddressTransactions,
};
