const conf = require('ocore/conf');
const Moralis = require("moralis/node");

async function init() {
	const serverUrl = conf.moralis.serverUrl;
	const appId = conf.moralis.appId;
	const masterKey = conf.moralis.masterKey;
	if (!serverUrl || !appId || !masterKey) {
		throw new Error('Please set moralis config');
	}

	await Moralis.start({ serverUrl, appId, masterKey });
}

module.exports = {
	init,
}
