const governanceDiscord = require("governance_events/governance_discord");
const { ethers } = require('ethers');
const conf = require('../../conf');

const {
	getLinkToExplorerByTX
} = require("../../utils/getLinkToExplorer");

function normalizeTriggerAddress(event) {
	if (event.trigger_address === null || event.trigger_address === undefined)
		return;
	try {
		event.trigger_address = ethers.getAddress(event.trigger_address);
	} catch (e) {
		console.log('invalid EVM trigger address, keeping original value', event.trigger_address);
	}
}

class Discord {
	static announceEvent(meta, event) {
		normalizeTriggerAddress(event);

		const aa_name = meta.main_aa + ' - ' + meta.bridgeAsset.symbol + ' on ' + meta.network + ' (' + (meta.isImport ? 'import' : 'export') + ')';
		return governanceDiscord.announceEvent(
			aa_name,
			meta.votingAsset.symbol,
			meta.votingAsset.decimals,
			conf.counterstake_base_url + meta.main_aa,
			event,
			getLinkToExplorerByTX(meta.network, event.trigger_unit)
		);
	}
}

module.exports = Discord;
