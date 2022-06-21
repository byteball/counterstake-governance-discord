const Discord = require("../controllers/Discord");

// Deposit(address indexed who, uint amount)
async function deposit(contract, who, amount, transaction) {
	const { name: contract_name, address, meta } = contract;

	let event = {
		aa_address: address,
		trigger_address: who,
		trigger_unit: transaction.transactionHash,
		name: contract_name,
		type: 'deposit',
		amount: amount.toString(),
	}

	console.error('event=', event);
	Discord.announceEvent(meta, event);
}

// Withdrawal(address indexed who, uint amount)
async function withdrawal(contract, who, amount, transaction) {
	const { name: contract_name, address, meta } = contract;

	let event = {
		aa_address: address,
		trigger_address: who,
		trigger_unit: transaction.transactionHash,
		name: contract_name,
		type: 'withdraw',
		amount: amount.toString(),
	}

	console.error('event=', event);
	Discord.announceEvent(meta, event);
}

module.exports = {
	deposit,
	withdrawal,
}
