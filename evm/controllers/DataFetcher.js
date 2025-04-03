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
		const encoded = ethers.AbiCoder.defaultAbiCoder().encode(['uint[]'], [leader_value]);
		const leader_support = await contract.votesByValue(ethers.keccak256(encoded));

		let support = null;
		let value = null;
		if (data) {
			const dataEncoded = ethers.AbiCoder.defaultAbiCoder().encode(['uint[]'], [data.value]);
			support = await contract.votesByValue(ethers.keccak256(dataEncoded));
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
