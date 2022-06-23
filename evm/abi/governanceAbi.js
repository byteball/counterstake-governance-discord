const governanceAbi = [
	'constructor(address _governedContractAddress, address _votingTokenAddress)',
	'event Deposit(address indexed who, uint256 amount)',
	'event Withdrawal(address indexed who, uint256 amount)',
	'function balances(address) view returns (uint256)',
	'function governance_challenging_period() view returns (uint256)',
	'function governance_freeze_period() view returns (uint256)',
	'function governedContractAddress() view returns (address)',
	'function votedValues(uint256) view returns (address)',
	'function votedValuesMap(string) view returns (address)',
	'function votingTokenAddress() view returns (address)',
	'function init(address _governedContractAddress, address _votingTokenAddress)',
	'function addressBelongsToGovernance(address addr) view returns (bool)',
	'function isUntiedFromAllVotes(address addr) view returns (bool)',
	'function addVotedValue(string name, address votedValue)',
	'function deposit(address from, uint256 amount) payable',
	'function deposit(uint256 amount) payable',
	'function withdraw(uint256 amount)',
	'function withdraw()'
];

module.exports = {
	governanceAbi
}

