const { ethers } = require("ethers");

const { getAbiByType } = require('../abi/getAbiByType');
const governanceHandlers = require('../eventHandlers/governance');
const uintHandlers = require("../eventHandlers/uint");
const uintArrayHandlers = require("../eventHandlers/uintArray");
const addressHandlers = require("../eventHandlers/address");

class Handlers {
	static addGovernanceHandler(contract, provider) {
		const c = new ethers.Contract(contract.address, getAbiByType('governance'), provider);
		c.on('Deposit', (...args) => {
			governanceHandlers.deposit(contract, ...args);
		});
		c.on('Withdrawal', (...args) => {
			governanceHandlers.withdrawal(contract, ...args);
		});
	}

	static addUintHandler(contract, provider) {
		const c = new ethers.Contract(contract.address, getAbiByType('Uint'), provider);
		c.on('Vote', (...args) => {
			uintHandlers.vote(contract, ...args);
		});
		c.on('Unvote', (...args) => {
			uintHandlers.unvote(contract, provider, ...args);
		});
	}

	static addUintArrayHandler(contract, provider) {
		const c = new ethers.Contract(contract.address, getAbiByType('UintArray'), provider);
		c.on('Vote', (...args) => {
			uintArrayHandlers.vote(contract, ...args);
		});
		c.on('Unvote', (...args) => {
			uintArrayHandlers.unvote(contract, provider, ...args);
		});
	}

	static addAddressHandler(contract, provider) {
		const c = new ethers.Contract(contract.address, getAbiByType('address'), provider);
		c.on('Vote', (...args) => {
			addressHandlers.vote(contract, ...args);
		});
		c.on('Unvote', (...args) => {
			addressHandlers.unvote(contract, provider, ...args);
		});
	}
}

module.exports = Handlers;
