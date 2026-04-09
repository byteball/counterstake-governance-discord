const conf = require('ocore/conf');
const { ethers } = require("ethers");
const EventEmitter = require('node:events');

const sleep = require('../../utils/sleep');

const CHECK_INTERVAL = 10000;
const DEFAULT_RECONNECT_DELAY_SECONDS = 2;
const WS_CONNECT_STAGGER_SECONDS = 2;
let wsConnectQueue = Promise.resolve();

async function enqueueWebSocketProviderCreation(createProvider) {
	const task = async () => {
		const provider = createProvider();
		await sleep(WS_CONNECT_STAGGER_SECONDS);
		return provider;
	};

	const pendingTask = wsConnectQueue
		.catch(() => {})
		.then(task);

	wsConnectQueue = pendingTask.catch(() => {});
	return pendingTask;
}

function validateRpcWebSocketUrl(network, rawUrl) {
	let url;
	try {
		url = new URL(rawUrl);
	} catch (error) {
		throw new Error(`[Provider[${network}]] invalid websocket URL: ${rawUrl}`);
	}

	if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
		throw new Error(`[Provider[${network}]] unsupported websocket protocol: ${url.protocol}`);
	}
}

class Provider {
	#network;
	#url;
	#connectCB;
	#providerFactory;
	#reconnectDelaySeconds;
	
	#lastBlock = 0;
	#lastBlockFromEvent = 0;
	#lastBlockInterval;
	#connecting = false;
	#pendingConnect = false;
	#reconnectTimeout = null;
	
	_provider = null;
	events = new EventEmitter();

	constructor(network, options = {}) {
		this.#network = network;
		this.#url = conf.ws_nodes[network];
		this.#providerFactory = options.providerFactory || ((url) => new ethers.WebSocketProvider(url));
		this.#reconnectDelaySeconds = Number.isFinite(Number(options.reconnectDelaySeconds)) && Number(options.reconnectDelaySeconds) >= 0
			? Number(options.reconnectDelaySeconds)
			: DEFAULT_RECONNECT_DELAY_SECONDS;
		this.events.setMaxListeners(100);
		if (!this.#url) {
			throw new Error(`Network ${network} not supported`);
		}
		validateRpcWebSocketUrl(network, this.#url);
	}

	get network() {
		return this.#network;
	}

	get url() {
		return this.#url;
	}

	get provider() {
		return this._provider;
	}

	connect(cb) {
		if (cb) {
			this.#connectCB = cb;
		}
		this.#clearReconnectTimeout();
		if (this.#connecting) {
			this.#pendingConnect = true;
			return;
		}
		this.#startCreateProvider();
	}
	
	startSubscribeCheck() {
		clearInterval(this.#lastBlockInterval);
		this.#lastBlockInterval = setInterval(async () => {
			if (this.#lastBlock === this.#lastBlockFromEvent) {
				console.error(
					`[Provider[${this.#network}].subscribe_check] stalled: ` +
					`lastBlock=${this.#lastBlock}, lastBlockFromEvent=${this.#lastBlockFromEvent}, intervalMs=${CHECK_INTERVAL}`
				);
				this.close();
				return;
			}
			
			this.#lastBlock = this.#lastBlockFromEvent;
		}, CHECK_INTERVAL);
	}
	
	close() {
		this.#disconnect(this._provider, { reconnect: true });
	}
	
	async #createProvider() {
		if (this.#connecting || this._provider)
			return;

		this.#connecting = true;
		try {
			await enqueueWebSocketProviderCreation(() => {
				const provider = this.#providerFactory(this.#url);
				this._provider = provider;
				
				provider.websocket.on('open', () => {
					this.#onOpen(provider);
				});
				provider.websocket.on('close', (code) => {
					this.#onClose(provider, code);
				});
				provider.websocket.on('error', (error) => {
					this.#onError(provider, error);
				});

				return provider;
			});
		} finally {
			this.#connecting = false;
			if (this.#pendingConnect && !this._provider) {
				this.#pendingConnect = false;
				this.#startCreateProvider();
			}
		}
	}

	#startCreateProvider() {
		void this.#createProvider().catch((error) => {
			console.error(`[Provider[${this.#network}].connect] failed to create provider`, error);
			this.#scheduleReconnect();
		});
	}

	#onOpen(provider) {
		if (provider !== this._provider)
			return;

		provider.on('block', (lastBlock) => {
			this.#lastBlockFromEvent = lastBlock;
		});
	
		Promise.resolve(this.#connectCB?.()).catch((error) => {
			console.error(`[Provider[${this.#network}].connect]:`, error);
			this.#disconnect(provider, { reconnect: true });
		});
	}

	async #onError(provider, error) {
		if (provider !== this._provider)
			return;

		console.error(`[Provider[${this.#network}].ws_error]:`, error);
		await this.#disconnect(provider, { reconnect: true });
	}

	async #onClose(provider, code) {
		if (provider !== this._provider)
			return;

		console.warn(`[Provider[${this.#network}].ws_close]:`, code);
		await this.#disconnect(provider, { reconnect: true });
	}

	async #disconnect(provider, { reconnect }) {
		if (!provider || provider !== this._provider)
			return;

		this._provider = null;
		this.events.emit('close');
		clearInterval(this.#lastBlockInterval);
		this.#lastBlockInterval = null;
		this.#lastBlock = 0;
		this.#lastBlockFromEvent = 0;
		try {
			if (!provider.destroyed)
				await provider.destroy();
		} finally {
			if (reconnect)
				this.#scheduleReconnect();
		}
	}

	#scheduleReconnect() {
		if (this.#reconnectTimeout)
			return;

		this.#reconnectTimeout = setTimeout(() => {
			this.#reconnectTimeout = null;
			this.connect();
		}, this.#reconnectDelaySeconds * 1000);
	}

	#clearReconnectTimeout() {
		if (!this.#reconnectTimeout)
			return;

		clearTimeout(this.#reconnectTimeout);
		this.#reconnectTimeout = null;
	}
}


module.exports = Provider;
module.exports.validateRpcWebSocketUrl = validateRpcWebSocketUrl;
