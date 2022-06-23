let eventsForV1 = {
	governance: {
		events: [
			{
				name: 'deposit(uint amount)',
				code: 'function deposit(uint amount) payable external'
			},
			{
				name: 'deposit(address from, uint amount)',
				code: 'function deposit(address from, uint amount) nonReentrant payable public'
			},
			{
				name: 'withdraw()',
				code: 'function withdraw() external'
			},
			{
				name: 'withdraw(uint amount)',
				code: 'function withdraw(uint amount) nonReentrant public'
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
				code: 'function voteAndDeposit(uint256[] value, uint256 amount) nonReentrant payable external',
			},
			{
				name: 'unvote',
				code: 'function unvote() external',
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
			}
		]
	}
};

module.exports = {
	eventsForV1,
}
