const conf = require('ocore/conf');
const { ethers } = require("ethers");
const EventEmitter = require('node:events');

const sleep = require('../../utils/sleep');

const PING_INTERVAL = 5000;
const PING_TIMEOUT = 15000;
const CHECK_INTERVAL = 10000;

class Provider {
	#network;
	#url;
	#keepAliveInterval;
	#pingTimeout;
	#connectCB;
	
	#enableSubscribeCheck = false;
	#lastBlock = 0;
	#lastBlockFromEvent = 0;
	#lastBlockInterval;
	
	_provider;
	events = new EventEmitter();

	constructor(network, enableSubscribeCheck = false) {
		this.#network = network;
		this.#enableSubscribeCheck = enableSubscribeCheck;
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
		this.#createProvider();
	}

	#closeFromCheck() {
		this._provider.destroy();
		this.#lastBlock = 0;
		this.#lastBlockFromEvent = 0;
	}
	
	startSubscribeCheck() {
		this.#lastBlockInterval = setInterval(async () => {
			if (this.#lastBlock === this.#lastBlockFromEvent) {
				console.error('Subscribe check failed');
				this.#closeFromCheck();
				return;
			}
			
			this.#lastBlock = this.#lastBlockFromEvent;
		}, CHECK_INTERVAL);
	}
	
	#setupMessageInterceptor() {
		const originalMessageHandler = this._provider._websocket.onmessage;
	
		this._provider._websocket.onmessage = (messageEvent) => {
			try {
				const result = JSON.parse(messageEvent.data);
				
				if (result && result.id !== undefined) {
					const id = String(result.id);
					const request = this._provider._requests[id];
					if (!request) {
						const errorData = result.error || result;
						this.#onError(errorData);
						return;
					}
				}
				
				originalMessageHandler(messageEvent);
			} catch (error) {
				this.#onError(error);
			}
		};
	}

	#createProvider() {
		console.error(`[Provider[${this.#network}].ws] create provider`);
		this._provider = new ethers.providers.WebSocketProvider(this.#url);
		this.#setupMessageInterceptor();
		this._provider._websocket.on('open', this.#onOpen.bind(this));
		this._provider._websocket.on('close', this.#onClose.bind(this));
		this._provider._websocket.on('error', this.#onError.bind(this));
		this._provider._websocket.on('pong', this.#onPong.bind(this));
		
		this._provider.on('block', (lastBlock) => {
			this.#lastBlockFromEvent = lastBlock;
		});
	}

	#onOpen() {
		this.#keepAliveInterval = setInterval(() => {
			this._provider._websocket.ping()
			this.#pingTimeout = setTimeout(() => {
				console.log(`[Provider[${this.#network}].ws] timeout`);
				this._provider.destroy();
			}, PING_TIMEOUT);
		}, PING_INTERVAL);
		this.#connectCB();
	}

	#onPong() {
		clearInterval(this.#pingTimeout);
	}

	#onError(error) {
		console.error(`[Provider[${this.#network}].ws_error]:`, error);
		this._provider.destroy();
	}

	async #onClose(code) {
		console.error(`[Provider[${this.#network}].ws_close]:`, code);
		this._provider._websocket.removeAllListeners();
		this._provider.removeAllListeners();
		delete this._provider; 
		this.events.emit('close');
		clearInterval(this.#keepAliveInterval)
		clearTimeout(this.#pingTimeout)
		clearInterval(this.#lastBlockInterval);
		await sleep(5);
		this.connect();
	}
}


module.exports = Provider;
