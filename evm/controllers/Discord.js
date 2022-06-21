const governanceDiscord = require("governance_events/governance_discord");
const { getLinkToExplorerByAddress, getLinkToExplorer } = require("../../utils/getLinkToExplorer");

class Discord {
	static announceEvent(meta, event) {
		const aa_name = meta.main_aa + ' - ' + meta.symbol + ' on ' + meta.network + ' (' + (meta.isImport ? 'import' : 'export') + ')';
		governanceDiscord.announceEvent(
			aa_name,
			meta.symbol,
			meta.decimals,
			getLinkToExplorerByAddress(meta.network, meta.main_aa),
			event,
			getLinkToExplorer(meta.network)
		);
	}
}

module.exports = Discord;
