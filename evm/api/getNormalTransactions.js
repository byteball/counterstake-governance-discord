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

function getMoralisChainName(chain) {
	switch (chain) {
		case 'Ethereum':
			return process.env.testnet ? 'rinkeby' : 'eth';
		case 'BSC':
			return process.env.testnet ? 'bsc testnet' : 'bsc';
		case 'Polygon':
			return process.env.testnet ? 'mumbai' : 'polygon';
	}
	throw Error(`getMoralisChainName: unknown chain ${chain}`);
}

function getUrl(chain, address, lastBlock) {
	const chainName = getMoralisChainName(chain);
	return `https://deep-index.moralis.io/api/v2.2/${address}?chain=${chainName}&order=ASC&limit=100&include=internal_transactions&from_block=${lastBlock}`;
}

async function getNormalTransactions(chain, address, lastBlock, r = 0) {
	const url = getUrl(chain, address, lastBlock);
	try {
		const r = await axios.get(url, {
			headers: {
				'X-API-Key': process.env.moralis_api_key,
			}
		});
		if (Array.isArray(r.data.result)) {
			return r.data.result;
		}
		throw Error(`bad response from moralis for ${chain} ${address} ${lastBlock}: ${JSON.stringify(r.data)}`);
	} catch (e) {
		console.log('getNormalTransactions error', chain, address, lastBlock, r, e);
		if (r < 5) {
			await sleep(1);
			return getNormalTransactions(chain, address, lastBlock, ++r);
		}
		throw e;
	}
}

module.exports = {
	getNormalTransactions,
};
