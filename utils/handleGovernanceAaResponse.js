const GovernanceEventDedupe = require('../db/GovernanceEventDedupe');

async function handleGovernanceAaResponse(objResponse, {
	assocGovernanceAAs,
	assocCounterstakeAAs,
	governanceEvents,
	governanceDiscord,
	conf,
	dedupe = GovernanceEventDedupe,
	nowMs = Date.now(),
}) {
	if (objResponse.response.error)
		return false;
	if ((Math.ceil(nowMs / 1000) - objResponse.timestamp) / 60 / 60 > 24)
		return false;

	const governanceAa = assocGovernanceAAs[objResponse.aa_address];
	if (!governanceAa)
		return false;

	const dedupeKey = dedupe.buildObyteKey({
		aaAddress: objResponse.aa_address,
		triggerUnit: objResponse.trigger_unit,
	});
	const dedupeRef = {
		dedupeKey,
		source: 'obyte',
		network: 'Obyte',
		subjectAddress: objResponse.aa_address,
		triggerUnit: objResponse.trigger_unit,
	};
	const isNewEvent = await dedupe.markIfNew(dedupeRef);
	if (!isNewEvent)
		return false;

	try {
		const mainAa = assocCounterstakeAAs[governanceAa.main_aa];
		const event = await governanceEvents.treatResponseFromGovernanceAA(objResponse, mainAa.asset);
		const aaName = `${mainAa.aa_address} - ${mainAa.symbol} on Obyte (${governanceAa.is_import ? 'import' : 'export'})`;

		await Promise.resolve(governanceDiscord.announceEvent(
			aaName,
			mainAa.symbol,
			mainAa.decimals,
			conf.counterstake_base_url + mainAa.aa_address,
			event
		));

		return true;
	} catch (error) {
		await dedupe.remove(dedupeKey);
		throw error;
	}
}

module.exports = {
	handleGovernanceAaResponse,
};
