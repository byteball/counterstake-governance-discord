const {
	announceVote,
	announceCommit,
	announceUnvote,
} = require("./shared");

// (address indexed who, uint[] value, uint votes, uint total_votes, uint[] leader, uint leader_total_votes, uint expiry_ts)
async function vote(contract, who, arrValue, votes, total_votes, arrLeader, leader_total_votes, expiry_ts, transaction, options = {}) {
	await announceVote(contract, who, arrValue, votes, total_votes, arrLeader, leader_total_votes, transaction, options);
}

// (address indexed who, uint[] value)
async function commit(contract, who, arrValue, transaction, options = {}) {
	await announceCommit(contract, who, arrValue, transaction, options);
}

// (address indexed who, uint[] value, uint votes)
async function unvote(contract, provider, who, arrValue, votes, transaction, options = {}) {
	await announceUnvote(contract, provider, who, transaction, options);
}


module.exports = {
	vote,
	commit,
	unvote,
}
