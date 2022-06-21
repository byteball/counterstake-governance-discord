const { ethers } = require("ethers");
const Formatter = require("../controllers/Formatter");
const Discord = require("../controllers/Discord");
const { getAbiByType } = require("../abi/getAbiByType");
const DataFetcher = require("../controllers/DataFetcher");

// (address indexed who, address indexed value, uint votes, uint total_votes, address leader, uint leader_total_votes, uint expiry_ts)
function vote(contract, who, value, votes, total_votes, leader, leader_total_votes, expiry_ts, transaction) {
	const { name: contract_name, address, meta } = contract;

	const event = {
		aa_address: address,
		trigger_address: who,
		trigger_unit: transaction.blockHash,
		added_support: votes.toString(),
		name: contract_name,
		type: 'added_support',
		leader_support: leader_total_votes.toString(),
		leader_value: Formatter.format(contract_name, leader, meta),
		value: Formatter.format(contract_name, value, meta),
		support: total_votes.toString(),
	}

	console.error('event=', event);
	Discord.announceEvent(meta, event);
}

// (address indexed who, address indexed value, uint votes)
async function unvote(contract, provider, who, value, votes, transaction) {
	const { type, name: contract_name, address, meta } = contract;

	const c = new ethers.Contract(address, getAbiByType(type), provider);
	const {
		leader_value,
		leader_support,
	} = await DataFetcher.fetchVotedData(c);

	const event = {
		aa_address: address,
		trigger_address: who,
		trigger_unit: transaction.blockHash,
		name: contract_name,
		type: 'removed_support',
		leader_support: leader_support.toString(),
		leader_value: Formatter.format(contract_name, leader_value, meta),
	}

	console.error('event=', event);
	Discord.announceEvent(meta, event);
}


module.exports = {
	vote,
	unvote,
}
