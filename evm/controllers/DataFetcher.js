const { withRateLimitRetry } = require('../utils/withRateLimitRetry');

function cloneContractArg(value) {
	if (!Array.isArray(value))
		return value;

	return Array.from(value, cloneContractArg);
}

function withOptionalOverrides(args, callOverrides) {
	const normalizedArgs = args.map(cloneContractArg);
	if (callOverrides === undefined || callOverrides === null)
		return normalizedArgs;
	return [...normalizedArgs, callOverrides];
}

class DataFetcher {
	static async fetchVotedData(contract, data, callOverrides) {
		const leader_value = await withRateLimitRetry(
			'DataFetcher.fetchVotedData.leader',
			() => contract.leader(...withOptionalOverrides([], callOverrides))
		);
		const leader_support = await withRateLimitRetry(
			'DataFetcher.fetchVotedData.leader_support',
			() => contract.votesByValue(...withOptionalOverrides([leader_value], callOverrides))
		);
		let support = null;
		let value = null;
		if (data) {
			support = await withRateLimitRetry(
				'DataFetcher.fetchVotedData.support',
				() => contract.votesByValue(...withOptionalOverrides([data.value], callOverrides))
			);
			value = data.value.toString();
		}
		return {
			leader_value: leader_value.toString(),
			leader_support,
			support,
			value,
		};
	}

	static async fetchVotedArrayData(contract, data, callOverrides) {
		let leader_value = [];
		for (let i = 0; ; i++) {
			try {
				leader_value.push(await withRateLimitRetry(
					`DataFetcher.fetchVotedArrayData.leader:${i}`,
					() => contract.leader(...withOptionalOverrides([i], callOverrides))
				));
			} catch (e) {
				break;
			}
		}
		const leaderKey = await withRateLimitRetry(
			'DataFetcher.fetchVotedArrayData.leader_key',
			() => contract.getKey(...withOptionalOverrides([leader_value], callOverrides))
		);
		const leader_support = await withRateLimitRetry(
			'DataFetcher.fetchVotedArrayData.leader_support',
			() => contract.votesByValue(...withOptionalOverrides([leaderKey], callOverrides))
		);

		let support = null;
		let value = null;
		if (data) {
			const dataKey = await withRateLimitRetry(
				'DataFetcher.fetchVotedArrayData.support_key',
				() => contract.getKey(...withOptionalOverrides([data.value], callOverrides))
			);
			support = await withRateLimitRetry(
				'DataFetcher.fetchVotedArrayData.support',
				() => contract.votesByValue(...withOptionalOverrides([dataKey], callOverrides))
			);
			value = data.value.map(v => Number(v));
		}

		return {
			leader_value: leader_value.map(v => Number(v)),
			leader_support,
			support,
			value,
		}
	}
}

module.exports = DataFetcher;
