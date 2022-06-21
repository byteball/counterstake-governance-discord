const governanceDiscord = require("governance_events/governance_discord");
const {
	getLinkToExplorerByAddress,
	getLinkToExplorerByTX
} = require("../../utils/getLinkToExplorer");

class Discord {
	static announceEvent(meta, event) {
		const aa_name = meta.main_aa + ' - ' + meta.symbol + ' on ' + meta.network + ' (' + (meta.isImport ? 'import' : 'export') + ')';
		governanceDiscord.announceEvent(
			aa_name,
			meta.symbol,
			meta.decimals,
			getLinkToExplorerByAddress(meta.network, meta.main_aa),
			event,
			getLinkToExplorerByTX(meta.network, event.trigger_unit)
		);
	}
}

module.exports = Discord;
