const conf = require('ocore/conf');
const axios = require("axios");
const sleep = require("../../utils/sleep");

function getChainId(chain) {
	switch (chain) {
		case 'Ethereum':
			return process.env.testnet ? 4 : 1;
		case 'BSC':
			return process.env.testnet ? 97 : 56;
		case 'Polygon':
			return process.env.testnet ? 80001 : 137;
		case 'Kava':
			return process.env.testnet ? 2221 : 2222;
	}
	throw Error(`getChainId: unknown chain ${chain}`);
}

function getUrl(chain, hash) {
	const chainId = getChainId(chain);
	return `https://api.etherscan.io/v2/api?chainid=${chainId}&module=account&action=txlistinternal&txhash=${hash}&apikey=${process.env.eth_scan_api_key}`;
}

async function getInternalTransactions(chain, hash, r = 0) {
	const url = getUrl(chain, hash);
	try {
		const r = await axios.get(url);
		if (Array.isArray(r.data.result)) {
			return r.data.result;
		}
		if (r.data.message === 'NOTOK') {
			throw 'Max rate limit reached';
		}
		throw Error(`bad response from etherscan for ${chain} ${hash}: ${JSON.stringify(r.data)}`);
	} catch (e) {
		console.log('getInternalTransactions error', chain, hash, r, e);
		if (r < 5) {
			await sleep(10);
			return getInternalTransactions(chain, hash, ++r);
		}
		throw e;
	}
}

module.exports = {
	getInternalTransactions,
};
