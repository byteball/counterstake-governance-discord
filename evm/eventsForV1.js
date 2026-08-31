let eventsForV1 = {
	governance: {
		events: [
			{
				name: 'deposit(uint amount)',
				code: 'function deposit(uint amount) payable external'
			},
			{
				name: 'deposit(address from, uint amount)',
				code: 'function deposit(address from, uint amount) payable public'
			},
			{
				name: 'withdraw()',
				code: 'function withdraw() external'
			},
			{
				name: 'withdraw(uint amount)',
				code: 'function withdraw(uint amount) public'
			},
		]
	},
	Uint: {
		events: [
			{
				name: 'vote',
				code: 'function vote(uint value) external',
			},
			{
				name: 'voteAndDeposit',
				code: 'function voteAndDeposit(uint value, uint amount) payable external',
			},
			{
				name: 'unvote',
				code: 'function unvote() external',
			},
			{
				name: 'commit',
				code: 'function commit() external',
			}
		]
	},
	UintArray: {
		events: [
			{
				name: 'vote',
				code: 'function vote(uint[] value) external',
			},
			{
				name: 'voteAndDeposit',
				code: 'function voteAndDeposit(uint256[] value, uint256 amount) payable external',
			},
			{
				name: 'unvote',
				code: 'function unvote() external',
			},
			{
				name: 'commit',
				code: 'function commit() external',
			}
		]
	},
	address: {
		events: [
			{
				name: 'vote',
				code: 'function vote(address value) external',
			},
			{
				name: 'voteAndDeposit',
				code: 'function voteAndDeposit(address value, uint amount) payable external',
			},
			{
				name: 'unvote',
				code: 'function unvote() external',
			},
			{
				name: 'commit',
				code: 'function commit() external',
			}
		]
	}
};

module.exports = {
	eventsForV1,
}
