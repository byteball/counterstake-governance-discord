const mutex = require('ocore/mutex');
const logs = require('../../db/EventLogs');
const Discord = require('./Discord');

function buildEventId(meta, event) {
	return [
		meta.network,
		String(event.aa_address).toLowerCase(),
		event.trigger_unit,
		event.type,
		event.name,
	].join(':');
}

async function publish(meta, event, source) {
	const eventId = buildEventId(meta, event);
	const unlock = await mutex.lock(['EventPublisher', eventId]);

	try {
		if (await logs.hasEvent(eventId)) {
			console.log('skip already published event', eventId);
			return false;
		}

		await Discord.announceEvent(meta, event);
		await logs.saveEventLog({
			event_id: eventId,
			network: meta.network,
			address: String(event.aa_address).toLowerCase(),
			tx_hash: event.trigger_unit,
			aa_version: meta.aa_version,
			event_type: event.type,
			event_name: event.name,
			source,
			payload_json: JSON.stringify(event),
		});
		return true;
	} finally {
		unlock();
	}
}

module.exports = {
	publish,
};
