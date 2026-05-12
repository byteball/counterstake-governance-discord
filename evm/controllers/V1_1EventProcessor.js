const Discord = require("./Discord");
const V1_1 = require("../../db/V1_1");

class V1_1EventProcessor {
	static getLog(payload) {
		return payload?.log ?? payload;
	}

	static async announce(contract, payload, event) {
		const log = V1_1EventProcessor.getLog(payload);
		if (!log) {
			console.error('v1_1 log not found', contract.address);
			return;
		}

		if (log.removed) {
			console.log('skip removed v1_1 log', contract.address, log.transactionHash);
			return;
		}

		const txHash = log.transactionHash;
		const logIndex = typeof log.index === 'number' ? log.index : log.logIndex;
		const blockNumber = log.blockNumber;
		if (!txHash || typeof logIndex !== 'number' || typeof blockNumber !== 'number') {
			console.error('v1_1 log is incomplete', contract.address, log);
			return;
		}

		const accepted = await V1_1.claimEventDedupe(
			contract.meta.network,
			contract.address,
			txHash,
			logIndex,
			blockNumber
		);
		if (!accepted) {
			console.log('skip duplicate v1_1 event', contract.address, txHash, logIndex);
			return;
		}

		console.log('event v1_1:', event);
		Discord.announceEvent(contract.meta, event);
	}
}

module.exports = V1_1EventProcessor;
