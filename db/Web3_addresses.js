const db = require('ocore/db');

class Web3_addresses {
	static async getLastBlockByAddress(address) {
		const rows = await db.query("SELECT last_block FROM web3_addresses WHERE address = ?", [address]);
		if (rows.length) {
			return rows[0].last_block;
		}
		return 0;
	}

	static async setLastBlockByAddress(address, lastBlock) {
		await db.query("INSERT OR REPLACE INTO web3_addresses(address, last_block) VALUES(?, ?)", [address, lastBlock]);
	}
}

module.exports = Web3_addresses;
