const axios = require("axios");
const sleep = require("../../utils/sleep");
const {
	getMoralisChainName,
	getMoralisHeaders,
	normalizeMoralisInternalTransactions,
} = require('./moralis');

function getUrl(chain, hash) {
	const chainName = getMoralisChainName(chain);
	return `https://deep-index.moralis.io/api/v2.2/transaction/${hash}?chain=${encodeURIComponent(chainName)}&include=internal_transactions`;
}

function hasPositiveValue(value) {
	try {
		return BigInt(value) > 0n;
	} catch {
		return false;
	}
}

function selectFirstSuccessfulInternalTransaction(transactions) {
	return transactions.find((transaction) => !transaction.error && hasPositiveValue(transaction.value)) || null;
}

async function getInternalTransactions(chain, hash, r = 0) {
	const url = getUrl(chain, hash);
	try {
		const r = await axios.get(url, {
			headers: getMoralisHeaders(),
		});
		if (!Array.isArray(r.data?.internal_transactions))
			throw Error(`bad response from moralis for ${chain} ${hash}: ${JSON.stringify(r.data)}`);

		const transactions = normalizeMoralisInternalTransactions(r.data);
		return transactions;
	} catch (e) {
		console.log('getInternalTransactions error', chain, hash, r, e);
		if (r < 5) {
			await sleep(1);
			return getInternalTransactions(chain, hash, ++r);
		}
		throw e;
	}
}

module.exports = {
	getInternalTransactions,
	selectFirstSuccessfulInternalTransaction,
};
