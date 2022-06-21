const { ethers } = require("ethers");

const { getAbiByType } = require("../abi/getAbiByType");
const DataFetcher = require("../controllers/DataFetcher");
const Formatter = require("../controllers/Formatter");
const Discord = require("../controllers/Discord");

// (address indexed who, uint[] value, uint votes, uint total_votes, uint[] leader, uint leader_total_votes, uint expiry_ts)
function vote(contract, who, arrValue, votes, total_votes, arrLeader, leader_total_votes, expiry_ts, transaction) {
	const { name: contract_name, address, meta } = contract;

	const event = {
		aa_address: address,
		trigger_address: who,
		trigger_unit: transaction.blockHash,
		added_support: votes.toString(),
		name: contract_name,
		type: 'added_support',
		leader_support: leader_total_votes.toString(),
		leader_value: Formatter.format(contract_name, arrLeader.map(v => v.toNumber()), meta),
		value: Formatter.format(contract_name, arrValue.map(v => v.toNumber()), meta),
		support: total_votes.toString(),
	}

	console.error('event=', event);
	Discord.announceEvent(meta, event);
}

// (address indexed who, uint[] value, uint votes)
async function unvote(contract, provider, who, arrValue, votes, transaction) {
	const { type, name: contract_name, address, meta } = contract;

	const c = new ethers.Contract(address, getAbiByType(type), provider);
	const {
		leader_value,
		leader_support,
	} = await DataFetcher.fetchVotedArrayData(c);

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
