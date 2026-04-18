const governanceDiscord = require("governance_events/governance_discord");
const { ethers } = require('ethers');
const GovernanceEventDedupe = require('../../db/GovernanceEventDedupe');

const {
	getLinkToExplorerByAddress,
	getLinkToExplorerByTX
} = require("../../utils/getLinkToExplorer");

class Discord {
	static async announceEvent(meta, event, dedupeRef) {
		const isNewEvent = await GovernanceEventDedupe.markIfNew(dedupeRef);
		if (!isNewEvent)
			return;

		try {
			event.trigger_address = ethers.getAddress(event.trigger_address);

			const aa_name = meta.main_aa + ' - ' + meta.symbol + ' on ' + meta.network + ' (' + (meta.isImport ? 'import' : 'export') + ')';
			await governanceDiscord.announceEvent(
				aa_name,
				meta.symbol,
				meta.decimals,
				getLinkToExplorerByAddress(meta.network, meta.main_aa),
				event,
				getLinkToExplorerByTX(meta.network, event.trigger_unit)
			);
		} catch (error) {
			await GovernanceEventDedupe.remove(dedupeRef.dedupeKey);
			throw error;
		}
	}
}

module.exports = Discord;
