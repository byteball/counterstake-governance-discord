const { ethers } = require("ethers");

const Handlers = require('./Handlers');
const { getAbiByType } = require('../abi/getAbiByType');


function wait(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

class ContractManager {
	#contracts = {
		v1: {},
		'v1.1': {}
	};
	#initializedNetworks = {};
	#readyHandlers = {};
	#handlers = {
		governance: Handlers.addGovernanceHandler,
		Uint: Handlers.addUintHandler,
		UintArray: Handlers.addUintArrayHandler,
		address: Handlers.addAddressHandler,
	};

	async initNetworkContracts(contracts, network, provider) {
		if (this.#initializedNetworks[network]) {
			return;
		}

		try {
			for (let index in contracts) {
				const contract = contracts[index];
				await this.#setContracts(contract, network, provider);
				await wait(2000);
			}
		} catch (e) {
			if (e?.message &&
				(
					e.message.toLowerCase().includes('internal error') ||
					e.message.toLowerCase().includes('timeout')
				)
			) {
				console.error('Error initializing contracts:', e.message, '. try reconnect');
				provider.close();
				return;
			}
			
			throw e;
		}

		console.log('initNetworkContracts:', network, 'done');
		this.#initializedNetworks[network] = true;

		if (this.#readyHandlers[network]) {
			this.#readyHandlers[network](this.#contracts.v1[network]);
		}
	}

	initHandlersByNetwork(network, provider) {
		if (!this.#contracts['v1.1'][network]) {
			return;
		}

		this.#contracts['v1.1'][network].forEach(contract => {
			if (this.#handlers[contract.type]) {
				this.#handlers[contract.type](contract, provider);
			}
		});
	}

	onV1Ready(network, handler) {
		this.#readyHandlers[network] = handler;
	}

	#addContract(meta, address, type, name) {
		if (!this.#contracts[meta.aa_version][meta.network]) {
			this.#contracts[meta.aa_version][meta.network] = [];
		}
		
		console.log('added contract: ', {
			aa_version: meta.aa_version,
			network: meta.network,
			address,
			type,
			name,
		});

		this.#contracts[meta.aa_version][meta.network].push({
			address,
			type,
			name,
			meta,
		});
	}

	async #setContracts(contract, network, provider) {
		const { type, aa, aa_version, symbol, decimals } = contract;

		const isImport = type === 'import';
		const meta = { aa_version, network, symbol, decimals, isImport, main_aa: aa };

		const cs = new ethers.Contract(aa, getAbiByType('counterstake'), provider);
		const governance_address = await cs.governance();
		const governance = new ethers.Contract(governance_address, getAbiByType('governance'), provider);

		meta.governance_address = governance_address;

		this.#addContract(meta, governance_address, 'governance', 'governance');

		const ratio100 = await governance.votedValuesMap('ratio100');
		this.#addContract(meta, ratio100, 'Uint', 'ratio100');

		const counterstake_coef100 = await governance.votedValuesMap('counterstake_coef100');
		this.#addContract(meta, counterstake_coef100, 'Uint', 'counterstake_coef100');

		const min_stake = await governance.votedValuesMap('min_stake');
		this.#addContract(meta, min_stake, 'Uint', 'min_stake');

		const min_tx_age = await governance.votedValuesMap('min_tx_age');
		this.#addContract(meta, min_tx_age, 'Uint', 'min_tx_age');
		await wait(1000);

		const large_threshold = await governance.votedValuesMap('large_threshold');
		this.#addContract(meta, large_threshold, 'Uint', 'large_threshold');

		const challenging_periods = await governance.votedValuesMap('challenging_periods');
		this.#addContract(meta, challenging_periods, 'UintArray', 'challenging_periods');

		const large_challenging_periods = await governance.votedValuesMap('large_challenging_periods');
		this.#addContract(meta, large_challenging_periods, 'UintArray', 'large_challenging_periods');

		if (isImport) {
			const oracleAddress = await governance.votedValuesMap('oracleAddress');
			this.#addContract(meta, oracleAddress, 'address', 'address');

			const min_price20 = await governance.votedValuesMap('min_price20');
			this.#addContract(meta, min_price20, 'Uint', 'min_price20');
		}
	}
}

module.exports = ContractManager;
