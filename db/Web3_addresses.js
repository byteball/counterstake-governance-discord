const db = require('ocore/db');

class Web3_addresses {
	static async getLastBlockByAddress(network, address) {
		const rows = await db.query("SELECT last_block FROM web3_addresses WHERE network = ? AND address = ?", [network, address]);
		if (rows.length) {
			return rows[0].last_block;
		}
		return 0;
	}

	static async setLastBlockByAddress(network, address, lastBlock) {
		await db.query("INSERT OR REPLACE INTO web3_addresses(network, address, last_block) VALUES(?, ?, ?)", [network, address, lastBlock]);
	}
}

module.exports = Web3_addresses;
