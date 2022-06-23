function getChainNameForMoralis(network, testnet) {
	switch (network) {
		case 'Ethereum':
			if (testnet) {
				console.error('[WARN] Moralis: Ropsten, Rinkeby and Kovan are no longer supported starting June 2022')
			}
			return 'mainnet';
		case 'BSC':
			return testnet ? 'bsc testnet' : 'bsc';
		case 'Polygon':
			return testnet ? 'mumbai' : 'matic';
	}
}

module.exports = getChainNameForMoralis;

