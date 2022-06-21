const { counterstakeAbi } = require('./counterstakeAbi');
const { governanceAbi } = require('./governanceAbi');
const { votedValueUintAbi } = require('./votedValueUintAbi');
const { votedValueUintArrayAbi } = require('./votedValueUintArrayAbi');
const { votedAddressAbi } = require('./votedAddressAbi');

function getAbiByType(type) {
	switch (type) {
		case 'counterstake':
			return counterstakeAbi;
		case 'governance':
			return governanceAbi;
		case 'Uint':
			return votedValueUintAbi;
		case 'UintArray':
			return votedValueUintArrayAbi;
		case 'address':
			return votedAddressAbi;
	}
}

module.exports = {
	getAbiByType
}
