const links = {
	Ethereum: process.env.testnet ? 'https://ropsten.etherscan.io' : 'https://etherscan.io',
	BSC: process.env.testnet ? 'https://testnet.bscscan.com' : 'https://bscscan.com',
	Polygon: process.env.testnet ? 'https://mumbai.polygonscan.com' : 'https://polygonscan.com',
}

function getLinkToExplorer(network) {
	return links[network];
}

function getLinkToExplorerByAddress(network, address) {
	return getLinkToExplorer(network) + '/address/' + address;
}

function getLinkToExplorerByTX(network, hash) {
	return getLinkToExplorer(network) + '/tx/' + hash;
}

module.exports = {
	getLinkToExplorerByAddress,
	getLinkToExplorerByTX,
}
