const conf = require('ocore/conf');
const { ethers } = require("ethers");
const EventEmitter = require('node:events');

const CHECK_INTERVAL = 10000;
const RECONNECT_DELAYS_SECONDS = [5, 15, 30, 60, 120, 180, 300, 300, 300, 300];
const MAX_RECONNECT_ATTEMPTS = RECONNECT_DELAYS_SECONDS.length;

class Provider {
	#network;
	#url;
	#connectCB;
	
	#lastBlock = 0;
	#lastBlockFromEvent = 0;
	#lastBlockInterval;
	#reconnectAttempts = 0;
	#reconnectTimer = null;
	
	_provider = null;
	events = new EventEmitter();

	constructor(network) {
		this.#network = network;
		this.#url = conf.ws_nodes[network];
		this.events.setMaxListeners(100);
		if (!this.#url) {
			throw new Error(`Network ${network} not supported`);
		}
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
		this.#startCreateProvider();
	}
	
	startSubscribeCheck() {
		this.#lastBlockInterval = setInterval(async () => {
			if (this.#lastBlock === this.#lastBlockFromEvent) {
				console.error('Subscribe check failed');
				this.close();
				return;
			}
			
			this.#lastBlock = this.#lastBlockFromEvent;
		}, CHECK_INTERVAL);
	}
	
	close() {
		this.#scheduleReconnect('close');
	}

	#destroyProvider() {
		if (!this._provider || this._provider.destroyed) return;
		this._provider.websocket.removeAllListeners();
		this._provider.destroy();
	}

	#startCreateProvider() {
		try {
			this.#createProvider();
		} catch (error) {
			console.error(`[Provider[${this.#network}].create_error]:`, error);
			this.#scheduleReconnect('create_error');
		}
	}

	async #createProvider() {
		console.log(`[Provider[${this.#network}].ws] create provider`);
		this._provider = new ethers.WebSocketProvider(this.#url);
		
		this._provider.websocket.on('open', () => {
			this.#onOpen()
		});
		this._provider.websocket.on('close', (code) => {
			this.#onClose(code);
		});
		this._provider.websocket.on('error', (error) => {
			this.#onError(error);
		});
	}

	async #onOpen() {
		this._provider.on('block', (lastBlock) => {
			this.#lastBlockFromEvent = lastBlock;
		});
	
		try {
			await this.#connectCB();
			if (!this.#reconnectTimer) {
				this.#reconnectAttempts = 0;
			}
		} catch (error) {
			console.error(`[Provider[${this.#network}].connect_callback_error]:`, error);
			this.#scheduleReconnect('connect_callback_error');
		}
	}

	#onError(error) {
		console.error(`[Provider[${this.#network}].ws_error]:`, error);
		this.#scheduleReconnect('ws_error');
	}

	#onClose(code) {
		console.error(`[Provider[${this.#network}].ws_close]:`, code);
		this.#scheduleReconnect(`ws_close:${code}`);
	}

	#scheduleReconnect(reason) {
		if (this.#reconnectTimer) return;

		this.events.emit('close');
		clearInterval(this.#lastBlockInterval);
		this.#lastBlock = 0;
		this.#lastBlockFromEvent = 0;
		this.#destroyProvider();

		this.#reconnectAttempts++;
		if (this.#reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
			const error = new Error(`EVM provider ${this.#network} reconnect attempts exhausted after ${MAX_RECONNECT_ATTEMPTS} attempts`);
			error.code = 'EVM_PROVIDER_CONNECT_RETRY_EXHAUSTED';
			setImmediate(() => { throw error; });
			return;
		}

		const delaySeconds = RECONNECT_DELAYS_SECONDS[this.#reconnectAttempts - 1];
		console.error(`[Provider[${this.#network}].reconnect]:`, reason, `${this.#reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`, `wait ${delaySeconds}s`);
		this.#reconnectTimer = setTimeout(() => {
			this.#reconnectTimer = null;
			this.connect();
		}, delaySeconds * 1000);
	}
}


module.exports = Provider;
