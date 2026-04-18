const { getBridges } = require("../api/getBridges");

class Bridges {
	#bridgeContractsByNetwork = {};
	#refreshPromise = null;

	getContractsByNetwork(network) {
		return [...(this.#bridgeContractsByNetwork[network] || [])];
	}

	async init() {
		return this.refresh();
	}

	async refresh() {
		if (this.#refreshPromise)
			return this.#refreshPromise;

		this.#refreshPromise = this.#refresh();
		try {
			await this.#refreshPromise;
		} finally {
			this.#refreshPromise = null;
		}
	}

	async #refresh() {
		const bridges = await getBridges();
		if (!bridges.length)
			throw new Error('Failed to initialize bridges!');

		const nextContractsByNetwork = {};
		for (const bridge of bridges)
			this.#parseBridge(bridge, nextContractsByNetwork);

		this.#bridgeContractsByNetwork = nextContractsByNetwork;
	}

	#addBridgeContract(target, network, type, aa, aa_version, symbol, decimals) {
		if (!target[network])
			target[network] = [];

		target[network].push({
			type,
			aa,
			aa_version,
			symbol,
			decimals,
		});
	}

	#parseBridge(bridge, target) {
		if (bridge.home_network !== 'Obyte') {
			this.#addBridgeContract(target,
				bridge.home_network,
				'export',
				bridge.export_aa,
				bridge.e_v,
				bridge.home_symbol,
				bridge.home_asset_decimals);
		}

		if (bridge.foreign_network !== 'Obyte') {
			this.#addBridgeContract(target,
				bridge.foreign_network,
				'import',
				bridge.import_aa,
				bridge.i_v,
				bridge.foreign_symbol,
				bridge.foreign_asset_decimals);
		}
	}
}


module.exports = Bridges;
