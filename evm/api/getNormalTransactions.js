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

function getUrl(chain, address, lastBlock) {
	const chainId = getChainId(chain);
	return `https://api.etherscan.io/v2/api?chainid=${chainId}&module=account&action=txlist&address=${address}&startblock=${lastBlock}&apikey=${process.env.eth_scan_api_key}`;
}

async function getNormalTransactions(chain, address, lastBlock, r = 0) {
	const url = getUrl(chain, address, lastBlock);
	try {
		const r = await axios.get(url);
		if (r.data.message === 'OK') {
			return r.data.result;
		}
		if (r.data.message === 'NOTOK' && r.data.result === 'Max rate limit reached') {
			throw 'Max rate limit reached';
		}
		return Error(`bad response from etherscan for ${chain} ${address} ${lastBlock}: ${JSON.stringify(r.data)}`);
	} catch (e) {
		console.log('getNormalTransactions error', chain, address, lastBlock, r, e);
		if (r < 5) {
			await sleep(1000);
			return getNormalTransactions(chain, address, lastBlock, ++r);
		}
		throw e;
	}
}

module.exports = {
	getNormalTransactions,
};
