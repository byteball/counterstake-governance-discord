const {
	announceVote,
	announceCommit,
	announceUnvote,
} = require("./shared");

// (address indexed who, uint indexed value, uint votes, uint total_votes, uint leader, uint leader_total_votes, uint expiry_ts)
async function vote(contract, who, value, votes, total_votes, leader, leader_total_votes, expiry_ts, transaction, options = {}) {
	await announceVote(contract, who, value, votes, total_votes, leader, leader_total_votes, transaction, options);
}

// (address indexed who, uint indexed value)
async function commit(contract, who, value, transaction, options = {}) {
	await announceCommit(contract, who, value, transaction, options);
}

// (address indexed who, uint indexed value, uint votes)
async function unvote(contract, provider, who, value, votes, transaction, options = {}) {
	await announceUnvote(contract, provider, who, transaction, options);
}


module.exports = {
	vote,
	commit,
	unvote,
}
