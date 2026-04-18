const { ethers } = require("ethers");

const { getAbiByType } = require("../abi/getAbiByType");
const GovernanceEventDedupe = require("../../db/GovernanceEventDedupe");
const DataFetcher = require("../controllers/DataFetcher");
const Formatter = require("../controllers/Formatter");
const Discord = require("../controllers/Discord");

function getSource(options) {
	return options?.source || 'evm_v1_log';
}

function normalizeValue(value) {
	if (!Array.isArray(value))
		return value;
	return Array.from(value, item => Number(item));
}

function buildEventBase(contract, who, transaction) {
	return {
		aa_address: contract.address,
		trigger_address: who,
		trigger_unit: transaction.transactionHash,
		name: contract.name,
	};
}

function buildLogDedupeRef(contract, event, transaction, source) {
	return GovernanceEventDedupe.createEvmLogRef({
		network: contract.meta.network,
		contractAddress: contract.address,
		txHash: transaction.transactionHash,
		transaction,
		eventType: event.type,
		eventName: event.name,
		triggerAddress: event.trigger_address,
		source,
	});
}

async function announceWithdrawal(contract, who, amount, transaction, options = {}) {
	const event = {
		...buildEventBase(contract, who, transaction),
		type: 'withdraw',
		amount: amount.toString(),
	};

	await Discord.announceEvent(
		contract.meta,
		event,
		buildLogDedupeRef(contract, event, transaction, getSource(options))
	);
}

async function announceDeposit(contract, who, amount, transaction, options = {}) {
	const event = {
		...buildEventBase(contract, who, transaction),
		type: 'deposit',
		amount: amount.toString(),
	};

	await Discord.announceEvent(
		contract.meta,
		event,
		buildLogDedupeRef(contract, event, transaction, getSource(options))
	);
}

async function announceVote(contract, who, value, votes, totalVotes, leader, leaderTotalVotes, transaction, options = {}) {
	const event = {
		...buildEventBase(contract, who, transaction),
		added_support: votes.toString(),
		type: 'added_support',
		leader_support: leaderTotalVotes.toString(),
		leader_value: Formatter.format(contract.name, normalizeValue(leader), contract.meta),
		value: Formatter.format(contract.name, normalizeValue(value), contract.meta),
		support: totalVotes.toString(),
	};

	await Discord.announceEvent(
		contract.meta,
		event,
		buildLogDedupeRef(contract, event, transaction, getSource(options))
	);
}

async function announceCommit(contract, who, value, transaction, options = {}) {
	const event = {
		...buildEventBase(contract, who, transaction),
		type: 'commit',
		value: Formatter.format(contract.name, normalizeValue(value), contract.meta),
	};

	await Discord.announceEvent(
		contract.meta,
		event,
		buildLogDedupeRef(contract, event, transaction, getSource(options))
	);
}

async function announceUnvote(contract, provider, who, transaction, options = {}) {
	const c = new ethers.Contract(contract.address, getAbiByType(contract.type), provider);
	const callOverrides = options.blockTag !== undefined ? { blockTag: options.blockTag } : undefined;
	const fetched = contract.type === 'UintArray'
		? await DataFetcher.fetchVotedArrayData(c, null, callOverrides)
		: await DataFetcher.fetchVotedData(c, null, callOverrides);

	const event = {
		...buildEventBase(contract, who, transaction),
		type: 'removed_support',
		leader_support: fetched.leader_support.toString(),
		leader_value: Formatter.format(contract.name, normalizeValue(fetched.leader_value), contract.meta),
	};

	await Discord.announceEvent(
		contract.meta,
		event,
		buildLogDedupeRef(contract, event, transaction, getSource(options))
	);
}

module.exports = {
	announceWithdrawal,
	announceDeposit,
	announceVote,
	announceCommit,
	announceUnvote,
};
