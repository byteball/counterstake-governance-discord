const { ethers } = require("ethers");

const Handlers = require('./Handlers');
const { getAbiByType } = require('../abi/getAbiByType');
const { withRateLimitRetry } = require('../utils/withRateLimitRetry');

const SUPPORTED_AA_VERSIONS = new Set(['v1', 'v1.1']);

function wait(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeAaVersion(version) {
	if (version === undefined || version === null)
		return null;

	const normalized = version.toString().trim().toLowerCase();
	if (!normalized)
		return null;
	if (normalized === 'v1.0' || normalized === '1' || normalized === '1.0')
		return 'v1';
	if (normalized === 'v1.1' || normalized === '1.1')
		return 'v1.1';
	return normalized;
}

class ContractManager {
	#contracts = {
		v1: {},
		'v1.1': {}
	};
	#initializingNetworks = {};
	#readyHandlers = {
		v1: {},
		'v1.1': {},
	};
	#handlers = {
		governance: Handlers.addGovernanceHandler,
		Uint: Handlers.addUintHandler,
		UintArray: Handlers.addUintArrayHandler,
		address: Handlers.addAddressHandler,
	};

	async initNetworkContracts(contracts, network, provider, options = {}) {
		if (this.#initializingNetworks[network])
			return this.#initializingNetworks[network];

		this.#initializingNetworks[network] = (async () => {
			const nextContracts = {
				v1: [],
				'v1.1': [],
			};

			try {
				for (const contract of (contracts || [])) {
					await this.#setContracts(nextContracts, contract, network, provider);
					await wait(2000);
				}
			} catch (e) {
				if (e?.message &&
					(
						e.message.toLowerCase().includes('internal error') ||
						e.message.toLowerCase().includes('timeout')
					)
				) {
					console.warn(`[ContractManager:${network}] retriable initialization failure: ${e.message}`);
					options.requestReconnect?.();
					return false;
				}

				throw e;
			}

			this.#contracts.v1[network] = nextContracts.v1;
			this.#contracts['v1.1'][network] = nextContracts['v1.1'];
			console.log(
				`[ContractManager:${network}] ready: v1=${this.#contracts.v1[network]?.length || 0}, ` +
				`v1.1=${this.#contracts['v1.1'][network]?.length || 0}`
			);

			if (this.#readyHandlers.v1[network])
				this.#readyHandlers.v1[network](this.#contracts.v1[network] || []);

			if (this.#readyHandlers['v1.1'][network])
				this.#readyHandlers['v1.1'][network](this.#contracts['v1.1'][network] || []);

			return true;
		})();

		try {
			return await this.#initializingNetworks[network];
		} finally {
			delete this.#initializingNetworks[network];
		}
	}

	initHandlersByNetwork(network, provider, options = {}) {
		if (!this.#contracts['v1.1'][network]?.length)
			return;

		this.#contracts['v1.1'][network].forEach(contract => {
			if (this.#handlers[contract.type])
				this.#handlers[contract.type](contract, provider, options);
		});
	}

	onV1Ready(network, handler) {
		this.#readyHandlers.v1[network] = handler;
	}

	onV1_1Ready(network, handler) {
		this.#readyHandlers['v1.1'][network] = handler;
	}

	#addContract(target, meta, address, type, name) {
		if (!SUPPORTED_AA_VERSIONS.has(meta.aa_version)) {
			console.warn(`[ContractManager:${meta.network}] unsupported aa_version=${meta.aa_version} for ${address}`);
			return;
		}

		target[meta.aa_version].push({
			address,
			type,
			name,
			meta,
		});
	}

	async #setContracts(target, contract, network, provider) {
		const { type, aa, aa_version, symbol, decimals } = contract;
		const normalizedAaVersion = normalizeAaVersion(aa_version);

		const isImport = type === 'import';
		if (!SUPPORTED_AA_VERSIONS.has(normalizedAaVersion)) {
			console.warn(`[ContractManager:${network}] unsupported bridge aa_version=${aa_version} for ${aa}`);
			return;
		}

		const meta = { aa_version: normalizedAaVersion, network, symbol, decimals, isImport, main_aa: aa };
		const readWithRetry = (label, fn) => withRateLimitRetry(`${network}:${label}`, fn);

		const cs = new ethers.Contract(aa, getAbiByType('counterstake'), provider);
		const governance_address = await readWithRetry(`counterstake.governance:${aa}`, () => cs.governance());
		const governance = new ethers.Contract(governance_address, getAbiByType('governance'), provider);

		meta.governance_address = governance_address;
		this.#addContract(target, meta, governance_address, 'governance', 'governance');

		const ratio100 = await readWithRetry(`governance.votedValuesMap:ratio100:${governance_address}`, () => governance.votedValuesMap('ratio100'));
		this.#addContract(target, meta, ratio100, 'Uint', 'ratio100');

		const counterstake_coef100 = await readWithRetry(`governance.votedValuesMap:counterstake_coef100:${governance_address}`, () => governance.votedValuesMap('counterstake_coef100'));
		this.#addContract(target, meta, counterstake_coef100, 'Uint', 'counterstake_coef100');

		const min_stake = await readWithRetry(`governance.votedValuesMap:min_stake:${governance_address}`, () => governance.votedValuesMap('min_stake'));
		this.#addContract(target, meta, min_stake, 'Uint', 'min_stake');

		const min_tx_age = await readWithRetry(`governance.votedValuesMap:min_tx_age:${governance_address}`, () => governance.votedValuesMap('min_tx_age'));
		this.#addContract(target, meta, min_tx_age, 'Uint', 'min_tx_age');
		await wait(1000);

		const large_threshold = await readWithRetry(`governance.votedValuesMap:large_threshold:${governance_address}`, () => governance.votedValuesMap('large_threshold'));
		this.#addContract(target, meta, large_threshold, 'Uint', 'large_threshold');

		const challenging_periods = await readWithRetry(`governance.votedValuesMap:challenging_periods:${governance_address}`, () => governance.votedValuesMap('challenging_periods'));
		this.#addContract(target, meta, challenging_periods, 'UintArray', 'challenging_periods');

		const large_challenging_periods = await readWithRetry(`governance.votedValuesMap:large_challenging_periods:${governance_address}`, () => governance.votedValuesMap('large_challenging_periods'));
		this.#addContract(target, meta, large_challenging_periods, 'UintArray', 'large_challenging_periods');

		if (isImport) {
			const oracleAddress = await readWithRetry(`governance.votedValuesMap:oracleAddress:${governance_address}`, () => governance.votedValuesMap('oracleAddress'));
			this.#addContract(target, meta, oracleAddress, 'address', 'address');

			const min_price20 = await readWithRetry(`governance.votedValuesMap:min_price20:${governance_address}`, () => governance.votedValuesMap('min_price20'));
			this.#addContract(target, meta, min_price20, 'Uint', 'min_price20');
		}
	}
}

module.exports = ContractManager;
