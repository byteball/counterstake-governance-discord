const votedValueUintAbi = [
		'constructor()',
		'event Commit(address indexed who, uint256 indexed value)',
		'event Unvote(address indexed who, uint256 indexed value, uint256 votes)',
		'event Vote(address indexed who, uint256 indexed value, uint256 votes, uint256 total_votes, uint256 leader, uint256 leader_total_votes, uint256 expiry_ts)',
		'function challenging_period_start_ts() view returns (uint256)',
		'function checkChallengingPeriodExpiry() view',
		'function checkVoteChangeLock() view',
		'function choices(address) view returns (uint256)',
		'function current_value() view returns (uint256)',
		'function governance() view returns (address)',
		'function hasVote(address) view returns (bool)',
		'function leader() view returns (uint256)',
		'function votesByValue(uint256) view returns (uint256)',
		'function votesByValueAddress(uint256, address) view returns (uint256)',
		'function init(address _governance, uint256 initial_value, function _validationCallback, function _commitCallback)',
		'function vote(uint256 value)',
		'function voteAndDeposit(uint256 value, uint256 amount) payable',
		'function unvote()',
		'function commit()'
	]
;

module.exports = {
	votedValueUintAbi,
}

