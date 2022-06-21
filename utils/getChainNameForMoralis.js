function getChainNameForMoralis(network, testnet) {
	switch (network) {
		case 'Ethereum':
			return 'mainnet';
		case 'BSC':
			return testnet ? 'bsc testnet' : 'bsc';
		case 'Polygon':
			return testnet ? 'mumbai' : 'matic';
	}
}

module.exports = getChainNameForMoralis;

