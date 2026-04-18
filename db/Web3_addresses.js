const db = require('ocore/db');

class Web3_addresses {
	static async getLastBlockState(network, address) {
		const rows = await db.query(
			"SELECT last_block FROM web3_addresses WHERE network = ? AND address = ?",
			[network, address]
		);
		if (!rows.length)
			return { exists: false, lastBlock: 0 };

		return {
			exists: true,
			lastBlock: rows[0].last_block,
		};
	}

	static async getLastBlock(network, address) {
		const state = await Web3_addresses.getLastBlockState(network, address);
		return state.lastBlock;
	}

	static async setLastBlock(network, address, lastBlock) {
		await db.query(
			"INSERT OR REPLACE INTO web3_addresses(network, address, last_block) VALUES(?, ?, ?)",
			[network, address, lastBlock]
		);
	}
}

module.exports = Web3_addresses;
