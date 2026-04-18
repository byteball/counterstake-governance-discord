const {
	announceDeposit,
	announceWithdrawal,
} = require("./shared");

// Deposit(address indexed who, uint amount)
async function deposit(contract, who, amount, transaction, options = {}) {
	await announceDeposit(contract, who, amount, transaction, options);
}

// Withdrawal(address indexed who, uint amount)
async function withdrawal(contract, who, amount, transaction, options = {}) {
	await announceWithdrawal(contract, who, amount, transaction, options);
}

module.exports = {
	deposit,
	withdrawal,
}
