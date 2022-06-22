const votedAddressAbi = [
	'constructor()',
	'event Commit(address indexed who, address indexed value)',
	'event Unvote(address indexed who, address indexed value, uint256 votes)',
	'event Vote(address indexed who, address indexed value, uint256 votes, uint256 total_votes, address leader, uint256 leader_total_votes, uint256 expiry_ts)',
	'function challenging_period_start_ts() view returns (uint256)',
	'function checkChallengingPeriodExpiry() view',
	'function checkVoteChangeLock() view',
	'function choices(address) view returns (address)',
	'function current_value() view returns (address)',
	'function governance() view returns (address)',
	'function hasVote(address) view returns (bool)',
	'function leader() view returns (address)',
	'function votesByValue(address) view returns (uint256)',
	'function votesByValueAddress(address, address) view returns (uint256)',
	'function init(address _governance, address initial_value, function _validationCallback, function _commitCallback)',
	'function vote(address value)',
	'function voteAndDeposit(address value, uint256 amount) payable',
	'function unvote()',
	'function commit()'
];

module.exports = {
	votedAddressAbi,
}

