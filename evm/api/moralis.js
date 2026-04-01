function getMoralisChainName(chain) {
	switch (chain) {
		case 'Ethereum':
			return process.env.testnet ? 'sepolia' : 'eth';
		case 'BSC':
			return process.env.testnet ? 'bsc testnet' : 'bsc';
		case 'Polygon':
			return process.env.testnet ? 'polygon amoy' : 'polygon';
	}

	throw Error(`unsupported chain for Moralis: ${chain}`);
}

function getMoralisHeaders() {
	return {
		'X-API-Key': process.env.moralis_api_key,
	};
}

function normalizeMoralisInternalTransactions(responseData) {
	if (!Array.isArray(responseData?.internal_transactions))
		return [];

	return responseData.internal_transactions.map((transaction) => ({
		value: transaction?.value !== undefined && transaction?.value !== null
			? transaction.value.toString()
			: '0',
		from: transaction?.from || null,
		to: transaction?.to || null,
		error: transaction?.error || null,
	}));
}

module.exports = {
	getMoralisChainName,
	getMoralisHeaders,
	normalizeMoralisInternalTransactions,
};
