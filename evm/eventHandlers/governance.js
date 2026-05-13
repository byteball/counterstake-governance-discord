const V1_1EventProcessor = require("../controllers/V1_1EventProcessor");
const { buildEventBase } = require("./shared");

// Deposit(address indexed who, uint amount)
async function deposit(contract, who, amount, transaction) {
	const event = buildEventBase(contract, transaction, {
		trigger_address: who,
		type: 'deposit',
		amount: amount.toString(),
	});

	await V1_1EventProcessor.announce(contract, transaction, event);
}

// Withdrawal(address indexed who, uint amount)
async function withdrawal(contract, who, amount, transaction) {
	const event = buildEventBase(contract, transaction, {
		trigger_address: who,
		type: 'withdraw',
		amount: amount.toString(),
	});

	await V1_1EventProcessor.announce(contract, transaction, event);
}

module.exports = {
	deposit,
	withdrawal,
}
