const { ethers } = require("ethers");

const { getAbiByType } = require('../abi/getAbiByType');
const governanceHandlers = require('../eventHandlers/governance');
const uintHandlers = require("../eventHandlers/uint");
const uintArrayHandlers = require("../eventHandlers/uintArray");
const addressHandlers = require("../eventHandlers/address");

class Handlers {
	static addGovernanceHandler(contract, provider) {
		let c = new ethers.Contract(contract.address, getAbiByType('governance'), provider.provider);
		c.on('Withdrawal', (...args) => {
			governanceHandlers.withdrawal(contract, ...args);
		});
		
		provider.events.once('close', () => {
			c.removeAllListeners();
			c = null;
		});
	}

	static addUintHandler(contract, provider) {
		let c = new ethers.Contract(contract.address, getAbiByType('Uint'), provider.provider);
		c.on('Vote', (...args) => {
			uintHandlers.vote(contract, ...args);
		});
		c.on('Unvote', (...args) => {
			uintHandlers.unvote(contract, provider.provider, ...args);
		});
		
		provider.events.once('close', () => {
			c.removeAllListeners();
			c = null;
		});
	}

	static addUintArrayHandler(contract, provider) {
		let c = new ethers.Contract(contract.address, getAbiByType('UintArray'), provider.provider);
		c.on('Vote', (...args) => {
			uintArrayHandlers.vote(contract, ...args);
		});
		c.on('Unvote', (...args) => {
			uintArrayHandlers.unvote(contract, provider.provider, ...args);
		});
		
		provider.events.once('close', () => {
			c.removeAllListeners();
			c = null;
		});
	}

	static addAddressHandler(contract, provider) {
		let c = new ethers.Contract(contract.address, getAbiByType('address'), provider.provider);
		c.on('Vote', (...args) => {
			addressHandlers.vote(contract, ...args);
		});
		c.on('Unvote', (...args) => {
			addressHandlers.unvote(contract, provider.provider, ...args);
		});
		
		provider.events.once('close', () => {
			c.removeAllListeners();
			c = null;
		});
	}
}

module.exports = Handlers;
