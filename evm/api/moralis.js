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

function buildCandidateDedupKey(candidate) {
	return [
		candidate.hash || '',
		(candidate.from_address || '').toLowerCase(),
		(candidate.to_address || '').toLowerCase(),
		candidate.input || '',
		candidate.value || '',
	].join(':');
}

function extractContractCallCandidatesFromMoralisTransaction(transaction, contractAddress) {
	const normalizedAddress = contractAddress.toLowerCase();
	const candidates = [];
	const seenKeys = new Set();

	if (
		transaction?.receipt_status === 1
		&& transaction?.to_address?.toLowerCase() === normalizedAddress
	) {
		candidates.push({
			hash: transaction.hash,
			block_number: transaction.block_number,
			block_timestamp: transaction.block_timestamp,
			transaction_index: transaction.transaction_index,
			from_address: transaction.from_address,
			to_address: transaction.to_address,
			input: transaction.input,
			value: transaction.value,
			source: 'normal',
			call_index: 0,
		});
	}

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
			block_number: transaction.block_number,
			block_timestamp: transaction.block_timestamp,
			transaction_index: transaction.transaction_index,
			from_address: internalFrom,
			to_address: internalTransaction.to,
			input: internalTransaction.input,
			value: internalTransaction.value,
			source: 'internal',
			call_index: i + 1,
		});
	}

	return candidates.filter((candidate) => {
		const key = buildCandidateDedupKey(candidate);
		if (seenKeys.has(key))
			return false;

		seenKeys.add(key);
		return true;
	});
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
	normalizeMoralisAddressTransactionsPage,
	extractContractCallCandidatesFromMoralisTransaction,
	normalizeMoralisInternalTransactions,
};
