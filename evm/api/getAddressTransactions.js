const axios = require("axios");
const {
	getMoralisChainName,
	normalizeMoralisAddressTransactionsPage,
} = require('./moralis');
const { withBoundedRetry } = require('../utils/boundedRetry');

function getUrl(chain, address, fromBlock, cursor = null) {
	const chainName = getMoralisChainName(chain);
	const params = new URLSearchParams({
		chain: chainName,
		order: 'ASC',
		limit: '100',
		from_block: String(fromBlock),
		include: 'internal_transactions',
	});

	if (cursor)
		params.set('cursor', cursor);

	return `https://deep-index.moralis.io/api/v2.2/${address}?${params.toString()}`;
}

async function getAddressTransactionsPage(chain, address, fromBlock, cursor = null) {
	const url = getUrl(chain, address, fromBlock, cursor);
	return withBoundedRetry(`moralis:${chain}:${address}:${fromBlock}`, async () => {
		const response = await axios.get(url, {
			headers: {
				'X-API-Key': process.env.moralis_api_key,
			},
		});
		if (!Array.isArray(response.data?.result))
			throw Error(`bad response from moralis for ${chain} ${address} ${fromBlock}: ${JSON.stringify(response.data)}`);

		return normalizeMoralisAddressTransactionsPage(response.data);
	});
}

function sortTransactionsAsc(transactions) {
	return [...transactions].sort((a, b) => {
		if ((a.block_number || 0) !== (b.block_number || 0))
			return (a.block_number || 0) - (b.block_number || 0);
		if ((a.transaction_index || 0) !== (b.transaction_index || 0))
			return (a.transaction_index || 0) - (b.transaction_index || 0);
		return (a.hash || '').localeCompare(b.hash || '');
	});
}

async function getAddressTransactions(chain, address, fromBlock) {
	const transactions = [];
	const seenCursors = new Set();
	let cursor = null;

	do {
		const page = await getAddressTransactionsPage(chain, address, fromBlock, cursor);
		transactions.push(...page.result);
		cursor = page.cursor;
		if (cursor) {
			if (seenCursors.has(cursor))
				throw new Error(`repeated Moralis cursor for ${chain} ${address}: ${cursor}`);
			seenCursors.add(cursor);
		}
	} while (cursor);

	return sortTransactionsAsc(transactions);
}

module.exports = {
	getAddressTransactions,
};
