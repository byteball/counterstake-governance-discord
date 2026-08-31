const Formatter = require('../controllers/Formatter');
const EventPublisher = require('../controllers/EventPublisher');
const { getTransactionHash } = require('./eventPayload');

async function commit(contract, who, value, transaction) {
	const { name, address, meta } = contract;
	const event = {
		aa_address: address,
		trigger_address: who,
		trigger_unit: getTransactionHash(transaction),
		timestamp: Math.floor(Date.now() / 1000),
		name,
		type: 'commit',
		value: String(Formatter.format(name, value, meta)),
	};

	return EventPublisher.publish(meta, event, 'realtime');
}

module.exports = commit;
