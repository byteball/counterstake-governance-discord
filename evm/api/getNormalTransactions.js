const axios = require("axios");
const sleep = require("../../utils/sleep");
const { getMoralisChainName, getMoralisHeaders } = require('./moralis');

function getUrl(chain, address, lastBlock) {
	const chainName = getMoralisChainName(chain);
	return `https://deep-index.moralis.io/api/v2.2/${address}?chain=${chainName}&order=ASC&limit=100&from_block=${lastBlock}`;
}

async function getNormalTransactions(chain, address, lastBlock, r = 0) {
	const url = getUrl(chain, address, lastBlock);
	try {
		const r = await axios.get(url, {
			headers: getMoralisHeaders(),
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
