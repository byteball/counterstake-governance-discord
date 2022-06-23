const axios = require("axios");
const conf = require("ocore/conf");
const sleep = require("../../utils/sleep");

async function getBridges(r = 0) {
	try {
		const bridges = await axios.get(`${conf.cs_url}/bridges`);
		return bridges.data.data;
	} catch (e) {
		if (r < 5 && e.response.status === 504) {
			await sleep(10);
			console.error('sleep: done');
			return getBridges(++r);
		}
		return [];
	}
}

module.exports = {
	getBridges,
}
