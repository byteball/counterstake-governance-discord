const { getBridges } = require("../api/getBridges");

class Bridges {
	#basicContractsByNetwork = {};

	getContractsByNetwork(network) {
		return this.#basicContractsByNetwork[network];
	}

	async init() {
		console.error('init bridges');
		const b = await getBridges();
		if (!b.length) {
			throw new Error('Failed to initialize bridges!')
		}
		console.error('bridges:', b.length);
		for (let i = 0; i < b.length; i++) {
			await this.#parseBridge(b[i]);
			console.error(`bridges: ${i + 1}/${b.length} done`);
		}
	}

	#addBasicContract(network, type, aa, aa_version, symbol, decimals) {
		if (!this.#basicContractsByNetwork[network]) {
			this.#basicContractsByNetwork[network] = [];
		}

		this.#basicContractsByNetwork[network].push({
			type,
			aa,
			aa_version,
			symbol,
			decimals,
		});
	}

	#parseBridge(bridge) {
		if (bridge.home_network !== 'Obyte') {
			this.#addBasicContract(bridge.home_network,
				'export',
				bridge.export_aa,
				bridge.e_v,
				bridge.home_symbol,
				bridge.home_asset_decimals);
		}

		if (bridge.foreign_network !== 'Obyte') {
			this.#addBasicContract(bridge.foreign_network,
				'import',
				bridge.import_aa,
				bridge.i_v,
				bridge.foreign_symbol,
				bridge.foreign_asset_decimals);
		}
	}
}


module.exports = Bridges;
