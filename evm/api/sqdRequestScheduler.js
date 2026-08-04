const sleep = require('../../utils/sleep');

const SQD_REQUEST_INTERVAL_MS = 525;
const DEFAULT_RATE_LIMIT_DELAY_MS = 10000;

let nextRequestAt = 0;
let queue = Promise.resolve();

function getRetryAfterMs(error) {
	const retryAfter = error.response?.headers?.['retry-after'];
	const seconds = Number(retryAfter);
	if (Number.isFinite(seconds)) return Math.max(seconds * 1000, SQD_REQUEST_INTERVAL_MS);
	const date = Date.parse(retryAfter);
	if (Number.isFinite(date)) return Math.max(date - Date.now(), SQD_REQUEST_INTERVAL_MS);
	return DEFAULT_RATE_LIMIT_DELAY_MS;
}

function scheduleSqdRequest(request) {
	const waitForSlot = queue.then(async () => {
		let delay = nextRequestAt - Date.now();
		while (delay > 0) {
			await sleep(delay / 1000);
			delay = nextRequestAt - Date.now();
		}
		nextRequestAt = Date.now() + SQD_REQUEST_INTERVAL_MS;
	});
	queue = waitForSlot.catch(() => {});
	return waitForSlot.then(request).catch(error => {
		if (error.response?.status === 429) {
			nextRequestAt = Math.max(nextRequestAt, Date.now() + getRetryAfterMs(error));
		}
		throw error;
	});
}

module.exports = scheduleSqdRequest;
