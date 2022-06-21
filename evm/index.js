const { utils } = require('ethers');

const Provider = require('./controllers/Provider');
const Bridges = require('./controllers/Bridges');
const ContractManager = require('./controllers/ContractManager');
const ContractRunnerForV1 = require('./controllers/ContractRunnerForV1');

const { eventsForV1 } = require('./eventsForV1');

const moralis = require('./moralis/index');
const Moralis = require("moralis/node");

function generateMetaForEventsInV1() {
	for (let type in eventsForV1) {
		const t = eventsForV1[type];
		if (!t.events.length) continue;

		const interfaces = t.events.map(v => v.code);
		t.iface = new utils.Interface(interfaces);
		t.events = t.events.map(v => {
			v.sighash = t.iface.getSighash(v.name);
			return v;
		});
	}
}

function initNetwork(name, contractManager, contractManagerOfV1, bridges) {
	const p = new Provider(name);
	contractManager.onV1Ready(name, (contracts) => { // v1
		contractManagerOfV1.setContracts(name, contracts);
	});
	p.connect(async () => { // >= v1.1
		contractManagerOfV1.setProvider(name, p.provider);
		const contracts = bridges.getContractsByNetwork(name);
		await contractManager.initNetworkContracts(contracts, name, p.provider);
		contractManager.initHandlersByNetwork(name, p.provider);
		console.error(`[${name}]: connected`);
	});
}

async function init() {
	generateMetaForEventsInV1();
	const bridges = new Bridges();
	await bridges.init();
	await moralis.init();

	const contractManager = new ContractManager();
	const contractManagerOfV1 = new ContractRunnerForV1();

	// initNetwork('Ethereum', contractManager, contractManagerOfV1, bridges);
	initNetwork('BSC', contractManager, contractManagerOfV1, bridges);
	// initNetwork('Polygon', contractManager, contractManagerOfV1, bridges);
}

module.exports = {
	init,
};
