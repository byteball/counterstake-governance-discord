const { ethers } = require('ethers');

const Provider = require('./controllers/Provider');
const Bridges = require('./controllers/Bridges');
const ContractManager = require('./controllers/ContractManager');
const ContractRunnerForV1 = require('./controllers/ContractRunnerForV1');
const V1_1HistoricalChecker = require('./controllers/V1_1HistoricalChecker');
const conf = require('ocore/conf');

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
	const v1_1HistoricalChecker = new V1_1HistoricalChecker({
		lookbackDays: conf.evm_v1_1_history_days,
		intervalHours: conf.evm_v1_1_history_interval_hours,
		confirmations: conf.evm_v1_1_history_confirmations,
		maxLogRangeBlocks: conf.evm_v1_1_history_max_log_range_blocks,
		avgBlockTimeSeconds: conf.evm_v1_1_avg_block_time_seconds,
		scanStartTimestamp: conf.scan_start_timestamp,
	});
	contractManager.onV1Ready(network, (contracts) => { // v1 only
		contractManagerOfV1.setContracts(network, contracts);
	});
	contractManager.onV1_1Ready(network, (contracts) => {
		v1_1HistoricalChecker.setContracts(network, contracts);
	});
	p.connect(async () => { // new provider (connect/reconnect)
		await bridges.refresh();
		const contracts = bridges.getContractsByNetwork(network);
		const initialized = await contractManager.initNetworkContracts(contracts, network, p.provider, {
			requestReconnect: () => p.close(),
		});
		if (!initialized)
			return;

		contractManagerOfV1.setProvider(network, p.provider);
		v1_1HistoricalChecker.setProvider(network, p.provider);
		contractManager.initHandlersByNetwork(network, p, {
			onError: () => {
				v1_1HistoricalChecker.runNetwork(network);
			},
		});
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
	const contractManagerOfV1 = new ContractRunnerForV1(30, {
		scanStartTimestamp: conf.scan_start_timestamp,
		avgBlockTimeSeconds: conf.evm_v1_1_avg_block_time_seconds,
	});

	initNetwork('Ethereum', contractManager, contractManagerOfV1, bridges);
	initNetwork('BSC', contractManager, contractManagerOfV1, bridges);
	initNetwork('Polygon', contractManager, contractManagerOfV1, bridges);
	initNetwork('Kava', contractManager, contractManagerOfV1, bridges, true);
}

module.exports = {
	init,
};
