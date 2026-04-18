const axios = require("axios");
const sleep = require("../../utils/sleep");
const {
	getMoralisChainName,
	getMoralisHeaders,
	normalizeMoralisAddressTransactionsPage,
} = require('./moralis');

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

async function getAddressTransactionsPage(chain, address, fromBlock, cursor = null, r = 0) {
	const url = getUrl(chain, address, fromBlock, cursor);
	try {
		const response = await axios.get(url, {
			headers: getMoralisHeaders(),
		});
		if (!Array.isArray(response.data?.result))
			throw Error(`bad response from moralis for ${chain} ${address} ${fromBlock}: ${JSON.stringify(response.data)}`);

		return normalizeMoralisAddressTransactionsPage(response.data);
	} catch (e) {
		console.log('getAddressTransactionsPage error', chain, address, fromBlock, cursor, r, e);
		if (r < 5) {
			await sleep(1);
			return getAddressTransactionsPage(chain, address, fromBlock, cursor, ++r);
		}
		throw e;
	}
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
	let cursor = null;

	do {
		const page = await getAddressTransactionsPage(chain, address, fromBlock, cursor);
		transactions.push(...page.result);
		cursor = page.cursor;
	} while (cursor);

	return sortTransactionsAsc(transactions);
}

module.exports = {
	getAddressTransactions,
	getAddressTransactionsPage,
};
