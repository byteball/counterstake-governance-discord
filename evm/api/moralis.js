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

function normalizeOptionalString(value) {
	if (value === undefined || value === null)
		return null;

	return value.toString();
}

function normalizeNumber(value) {
	if (value === undefined || value === null || value === '')
		return null;

	const normalized = Number(value);
	return Number.isFinite(normalized) ? normalized : null;
}

function normalizeMoralisAddressInternalTransactions(internalTransactions) {
	if (!Array.isArray(internalTransactions))
		return [];

	return internalTransactions.map((transaction) => ({
		from: normalizeOptionalString(transaction?.from),
		to: normalizeOptionalString(transaction?.to),
		value: transaction?.value !== undefined && transaction?.value !== null
			? transaction.value.toString()
			: '0',
		input: normalizeOptionalString(transaction?.input),
		error: transaction?.error || null,
	}));
}

function normalizeMoralisAddressTransaction(transaction) {
	return {
		hash: normalizeOptionalString(transaction?.hash),
		block_number: normalizeNumber(transaction?.block_number),
		block_timestamp: normalizeOptionalString(transaction?.block_timestamp),
		transaction_index: normalizeNumber(transaction?.transaction_index),
		from_address: normalizeOptionalString(transaction?.from_address),
		to_address: normalizeOptionalString(transaction?.to_address),
		value: transaction?.value !== undefined && transaction?.value !== null
			? transaction.value.toString()
			: '0',
		input: normalizeOptionalString(transaction?.input),
		receipt_status: normalizeNumber(transaction?.receipt_status),
		internal_transactions: normalizeMoralisAddressInternalTransactions(transaction?.internal_transactions),
	};
}

function normalizeMoralisLog(log, transaction) {
	const logIndex = normalizeNumber(log?.log_index);
	const topics = [
		log?.topic0,
		log?.topic1,
		log?.topic2,
		log?.topic3,
	].map(normalizeOptionalString).filter(Boolean);

	return {
		address: normalizeOptionalString(log?.address),
		transactionHash: normalizeOptionalString(log?.transaction_hash || transaction?.hash),
		transactionIndex: normalizeNumber(log?.transaction_index ?? transaction?.transaction_index),
		blockNumber: normalizeNumber(log?.block_number ?? transaction?.block_number),
		index: logIndex,
		logIndex,
		data: normalizeOptionalString(log?.data),
		topics,
		removed: false,
	};
}

function normalizeMoralisDecodedAddressTransaction(transaction) {
	return {
		...normalizeMoralisAddressTransaction(transaction),
		logs: Array.isArray(transaction?.logs)
			? transaction.logs.map(log => normalizeMoralisLog(log, transaction))
			: [],
	};
}

function normalizeMoralisAddressTransactionsPage(responseData) {
	if (!Array.isArray(responseData?.result)) {
		return {
			cursor: null,
			result: [],
		};
	}

	return {
		cursor: responseData.cursor || null,
		result: responseData.result.map(normalizeMoralisAddressTransaction),
	};
}

function normalizeMoralisDecodedAddressTransactionsPage(responseData) {
	if (!Array.isArray(responseData?.result)) {
		return {
			cursor: null,
			result: [],
		};
	}

	return {
		cursor: responseData.cursor || null,
		result: responseData.result.map(normalizeMoralisDecodedAddressTransaction),
	};
}

function extractContractCallCandidatesFromMoralisTransaction(transaction, contractAddress, contractType = null) {
	const normalizedAddress = contractAddress.toLowerCase();
	const candidates = [];

	if (transaction?.receipt_status !== 1)
		return candidates;

	if (transaction?.to_address?.toLowerCase() === normalizedAddress) {
		candidates.push({
			hash: transaction.hash,
			from_address: transaction.from_address,
			input: transaction.input,
			candidate_key: 'normal:0',
			parent_transaction: transaction,
		});
	}

	if (contractType !== 'governance') {
		for (let i = 0; i < (transaction?.internal_transactions || []).length; i++) {
			const internalTransaction = transaction.internal_transactions[i];
			const internalFrom = normalizeOptionalString(internalTransaction?.from);
			if (internalTransaction?.to?.toLowerCase() !== normalizedAddress)
				continue;
			if (!internalFrom)
				continue;
			if (internalTransaction.error)
				continue;
			if (!internalTransaction.input || internalTransaction.input === '0x')
				continue;

			candidates.push({
				hash: transaction.hash,
				from_address: internalFrom,
				input: internalTransaction.input,
				candidate_key: `internal:${i + 1}`,
				parent_transaction: transaction,
			});
		}
	}

	return candidates;
}

function selectFirstInternalTransaction(transactions) {
	return (transactions || [])[0] || null;
}

module.exports = {
	getMoralisChainName,
	normalizeMoralisAddressTransactionsPage,
	normalizeMoralisDecodedAddressTransactionsPage,
	extractContractCallCandidatesFromMoralisTransaction,
	selectFirstInternalTransaction,
};
