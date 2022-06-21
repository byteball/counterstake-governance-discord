const { ethers } = require("ethers");

class DataFetcher {
	static async fetchVotedData(contract, data) {
		const leader_value = await contract.leader();
		const leader_support = await contract.votesByValue(leader_value);
		let support = null;
		let value = null;
		if (data) {
			support = await contract.votesByValue(data.value);
			value = data.value.toString();
		}
		return {
			leader_value: leader_value.toString(),
			leader_support,
			support,
			value,
		};
	}

	static async fetchVotedArrayData(contract, data) {
		let leader_value = [];
		for (let i = 0; ; i++) {
			try {
				leader_value.push(await contract.leader(i));
			} catch (e) {
				break;
			}
		}
		const leader_support = await contract.votesByValue(ethers.utils.solidityKeccak256(['uint[]'], [leader_value]));
		let support = null;
		let value = null;
		if (data) {
			support = await contract.votesByValue(ethers.utils.solidityKeccak256(['uint[]'], [data.value]));
			value = data.value.map(v => v.toNumber());
		}

		return {
			leader_value: leader_value.map(v => v.toNumber()),
			leader_support,
			support,
			value,
		}
	}
}

module.exports = DataFetcher;
