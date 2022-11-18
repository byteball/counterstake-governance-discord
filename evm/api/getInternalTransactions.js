const conf = require('ocore/conf');
const axios = require("axios");
const sleep = require("../../utils/sleep");

function getUrl(chain, hash) {
	const q = `api?module=account&action=txlistinternal&txhash=${hash}`;
	switch (chain) {
		case 'Ethereum':
			return `https://api${process.env.testnet ? '-rinkeby' : ''}.etherscan.io/${q}&apikey=${conf.scan_api_keys.Ethereum}`;
		case 'BSC':
			return `https://api${process.env.testnet ? '-testnet' : ''}.bscscan.com/${q}&apikey=${conf.scan_api_keys.BSC}`;
		case 'Polygon':
			return `https://api${process.env.testnet ? '-testnet' : ''}.polygonscan.com/${q}&apikey=${conf.scan_api_keys.Polygon}`;
	}
}

async function getInternalTransactions(chain, hash, r = 0) {
	const url = getUrl(chain, hash);
	try {
		const r = await axios.get(url);
		if (r.data.message === 'OK') {
			return r.data.result;
		}
		return []
	} catch (e) {
		console.error('ERROR', e);
		if (r < 5 && e.response.status === 504) {
			await sleep(10);
			console.error('sleep: done');
			return getInternalTransactions(chain, hash, ++r);
		}
		return [];
	}
}

module.exports = {
	getInternalTransactions,
};
