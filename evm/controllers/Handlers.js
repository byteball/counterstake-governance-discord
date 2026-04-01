const { ethers } = require("ethers");

const { getAbiByType } = require('../abi/getAbiByType');
const governanceHandlers = require('../eventHandlers/governance');
const uintHandlers = require("../eventHandlers/uint");
const uintArrayHandlers = require("../eventHandlers/uintArray");
const addressHandlers = require("../eventHandlers/address");

function runAsyncHandler(label, fn, options = {}) {
	Promise.resolve()
		.then(fn)
		.catch((error) => {
			console.error(`[Handlers] ${label} failed`, error);
			options.onError?.(error, label);
		});
}

class Handlers {
	static addGovernanceHandler(contract, provider, options = {}) {
		let c = new ethers.Contract(contract.address, getAbiByType('governance'), provider.provider);
		c.on('Deposit', (...args) => {
			runAsyncHandler(`${contract.meta.network}:${contract.address}:Deposit`, () => governanceHandlers.deposit(contract, ...args, { provider: provider.provider }), options);
		});
		c.on('Withdrawal', (...args) => {
			runAsyncHandler(`${contract.meta.network}:${contract.address}:Withdrawal`, () => governanceHandlers.withdrawal(contract, ...args, { provider: provider.provider }), options);
		});
		
		provider.events.once('close', () => {
			c.removeAllListeners();
			c = null;
		});
	}

	static addUintHandler(contract, provider, options = {}) {
		let c = new ethers.Contract(contract.address, getAbiByType('Uint'), provider.provider);
		c.on('Vote', (...args) => {
			runAsyncHandler(`${contract.meta.network}:${contract.address}:Vote`, () => uintHandlers.vote(contract, ...args, { provider: provider.provider }), options);
		});
		c.on('Commit', (...args) => {
			runAsyncHandler(`${contract.meta.network}:${contract.address}:Commit`, () => uintHandlers.commit(contract, ...args, { provider: provider.provider }), options);
		});
		c.on('Unvote', (...args) => {
			runAsyncHandler(`${contract.meta.network}:${contract.address}:Unvote`, () => uintHandlers.unvote(contract, provider.provider, ...args, { provider: provider.provider }), options);
		});
		
		provider.events.once('close', () => {
			c.removeAllListeners();
			c = null;
		});
	}

	static addUintArrayHandler(contract, provider, options = {}) {
		let c = new ethers.Contract(contract.address, getAbiByType('UintArray'), provider.provider);
		c.on('Vote', (...args) => {
			runAsyncHandler(`${contract.meta.network}:${contract.address}:Vote`, () => uintArrayHandlers.vote(contract, ...args, { provider: provider.provider }), options);
		});
		c.on('Commit', (...args) => {
			runAsyncHandler(`${contract.meta.network}:${contract.address}:Commit`, () => uintArrayHandlers.commit(contract, ...args, { provider: provider.provider }), options);
		});
		c.on('Unvote', (...args) => {
			runAsyncHandler(`${contract.meta.network}:${contract.address}:Unvote`, () => uintArrayHandlers.unvote(contract, provider.provider, ...args, { provider: provider.provider }), options);
		});
		
		provider.events.once('close', () => {
			c.removeAllListeners();
			c = null;
		});
	}

	static addAddressHandler(contract, provider, options = {}) {
		let c = new ethers.Contract(contract.address, getAbiByType('address'), provider.provider);
		c.on('Vote', (...args) => {
			runAsyncHandler(`${contract.meta.network}:${contract.address}:Vote`, () => addressHandlers.vote(contract, ...args, { provider: provider.provider }), options);
		});
		c.on('Commit', (...args) => {
			runAsyncHandler(`${contract.meta.network}:${contract.address}:Commit`, () => addressHandlers.commit(contract, ...args, { provider: provider.provider }), options);
		});
		c.on('Unvote', (...args) => {
			runAsyncHandler(`${contract.meta.network}:${contract.address}:Unvote`, () => addressHandlers.unvote(contract, provider.provider, ...args, { provider: provider.provider }), options);
		});
		
		provider.events.once('close', () => {
			c.removeAllListeners();
			c = null;
		});
	}
}

module.exports = Handlers;
