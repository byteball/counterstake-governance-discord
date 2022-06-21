const { ethers } = require("ethers");

const { governanceAbi } = require("../abi/governanceAbi")
const governanceHandlers = require('../eventHandlers/governance');

const { votedValueUintAbi } = require("../abi/votedValueUintAbi");
const uintHandlers = require("../eventHandlers/uint");

const { votedValueUintArrayAbi } = require("../abi/votedValueUintArrayAbi");
const uintArrayHandlers = require("../eventHandlers/uintArray");

const { votedAddressAbi } = require("../abi/votedAddressAbi");
const addressHandlers = require("../eventHandlers/address");

class Handlers {
	static addGovernanceHandler(contract, provider) {
		const c = new ethers.Contract(contract.address, governanceAbi, provider);
		c.on('Deposit', (...args) => {
			governanceHandlers.deposit(contract, ...args);
		});
		c.on('Withdrawal', (...args) => {
			governanceHandlers.withdrawal(contract, ...args);
		});
	}

	static addUintHandler(contract, provider) {
		const c = new ethers.Contract(contract.address, votedValueUintAbi, provider);
		c.on('Vote', (...args) => {
			uintHandlers.vote(contract, ...args);
		});
		c.on('Unvote', (...args) => {
			uintHandlers.unvote(contract, provider, ...args);
		});
	}

	static addUintArrayHandler(contract, provider) {
		const c = new ethers.Contract(contract.address, votedValueUintArrayAbi, provider);
		c.on('Vote', (...args) => {
			uintArrayHandlers.vote(contract, ...args);
		});
		c.on('Unvote', (...args) => {
			uintArrayHandlers.unvote(contract, provider, ...args);
		});
	}

	static addAddressHandler(contract, provider) {
		const c = new ethers.Contract(contract.address, votedAddressAbi, provider);
		c.on('Vote', (...args) => {
			addressHandlers.vote(contract, ...args);
		});
		c.on('Unvote', (...args) => {
			addressHandlers.unvote(contract, provider, ...args);
		});
	}
}

module.exports = Handlers;
