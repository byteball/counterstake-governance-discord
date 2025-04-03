const { ethers } = require('ethers');

const Provider = require('./controllers/Provider');
const Bridges = require('./controllers/Bridges');
const ContractManager = require('./controllers/ContractManager');
const ContractRunnerForV1 = require('./controllers/ContractRunnerForV1');

const { eventsForV1 } = require('./eventsForV1');

function generateMetaForEventsInV1() {
	for (let type in eventsForV1) {
		const t = eventsForV1[type];
		if (!t.events.length) continue;

		const interfaces = t.events.map(v => v.code);
		t.iface = new ethers.Interface(interfaces);
		t.events = t.events.map(v => {
			try {
				const functionFragment = t.iface.getFunction(v.name);
				if (functionFragment) {
					v.sighash = functionFragment.selector;
				} else {
					console.error(`Function ${v.name} not found in interface, calculating selector manually`);
					const signature = `${v.name}()`;
					v.sighash = ethers.id(signature).substring(0, 10);
				}
			} catch (e) {
				console.error(e);
				throw `Error getting selector for ${v.name}`;
			}
			return v;
		});
	}
}

function initNetwork(network, contractManager, contractManagerOfV1, bridges, enableSubscribeCheck) {
	const p = new Provider(network);
	contractManager.onV1Ready(network, (contracts) => { // v1 only
		contractManagerOfV1.setContracts(network, contracts);
	});
	p.connect(async () => { // new provider (connect/reconnect)
		contractManagerOfV1.setProvider(network, p.provider);
		const contracts = bridges.getContractsByNetwork(network);
		await contractManager.initNetworkContracts(contracts, network, p.provider);
		contractManager.initHandlersByNetwork(network, p);
		if (enableSubscribeCheck) {
			p.startSubscribeCheck();
		}
		console.log(`[${network}]: connected`);
	});
}

async function init() {
	generateMetaForEventsInV1();
	const bridges = new Bridges();
	await bridges.init();

	const contractManager = new ContractManager();
	const contractManagerOfV1 = new ContractRunnerForV1();

	initNetwork('Ethereum', contractManager, contractManagerOfV1, bridges);
	initNetwork('BSC', contractManager, contractManagerOfV1, bridges);
	initNetwork('Polygon', contractManager, contractManagerOfV1, bridges);
	initNetwork('Kava', contractManager, contractManagerOfV1, bridges, true);
}

module.exports = {
	init,
};
