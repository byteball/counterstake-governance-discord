const sleep = require('../../utils/sleep');

const DEFAULT_RATE_LIMIT_RETRY_ATTEMPTS = 20;

function getErrorMessage(error) {
	return [
		error?.info?.error?.message,
		error?.error?.message,
		error?.shortMessage,
		error?.message,
	].filter(Boolean).join(' | ').toLowerCase();
}

function isEvmRateLimitError(error) {
	const message = getErrorMessage(error);
	const codes = [
		error?.code,
		error?.info?.error?.code,
		error?.error?.code,
	];

	if (codes.includes(30) || codes.includes(19))
		return true;

	return [
		'request limit reached',
		'rate limit',
		'too many requests',
		'limit reached',
		'request timeout on the free tier',
		'temporary internal error',
		'please retry',
	].some(fragment => message.includes(fragment));
}

function getRandomInt(min, max) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getPositiveInteger(value, fallback) {
	const normalized = Number(value);
	if (!Number.isFinite(normalized) || normalized <= 0)
		return fallback;

	return Math.floor(normalized);
}

class RateLimitRetryExhaustedError extends Error {
	constructor(label, attempts, cause) {
		super(`[${label}] EVM rate limit retry exhausted after ${attempts} attempts`);
		this.name = 'RateLimitRetryExhaustedError';
		this.code = 'EVM_RATE_LIMIT_RETRY_EXHAUSTED';
		this.label = label;
		this.attempts = attempts;
		this.cause = cause;
	}
}

function isRateLimitRetryExhaustedError(error) {
	return error?.code === 'EVM_RATE_LIMIT_RETRY_EXHAUSTED';
}

async function withRateLimitRetry(label, fn, options = {}) {
	const maxAttempts = getPositiveInteger(options.maxAttempts, DEFAULT_RATE_LIMIT_RETRY_ATTEMPTS);
	const minDelaySeconds = Number.isInteger(options.minDelaySeconds) ? options.minDelaySeconds : 10;
	const maxDelaySeconds = Number.isInteger(options.maxDelaySeconds) ? options.maxDelaySeconds : 30;
	const sleepFn = options.sleepFn || sleep;
	const randomIntFn = options.randomIntFn || getRandomInt;
	const normalizedMaxDelay = maxDelaySeconds >= minDelaySeconds ? maxDelaySeconds : minDelaySeconds;
	let attempt = 0;

	while (true) {
		try {
			return await fn();
		} catch (error) {
			if (!isEvmRateLimitError(error))
				throw error;

			attempt += 1;
			if (attempt >= maxAttempts)
				throw new RateLimitRetryExhaustedError(label, attempt, error);

			const delaySeconds = randomIntFn(minDelaySeconds, normalizedMaxDelay);
			console.error(`[${label}] EVM rate limit, retry #${attempt}/${maxAttempts - 1} in ${delaySeconds}s`);
			await sleepFn(delaySeconds);
		}
	}
}

module.exports = {
	DEFAULT_RATE_LIMIT_RETRY_ATTEMPTS,
	RateLimitRetryExhaustedError,
	isEvmRateLimitError,
	isRateLimitRetryExhaustedError,
	withRateLimitRetry,
};
