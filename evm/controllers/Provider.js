const conf = require('ocore/conf');
const { ethers } = require("ethers");

const sleep = require('../../utils/sleep');

const PING_INTERVAL = 5000;
const PING_TIMEOUT = 15000;
const CHECK_INTERVAL = 10000;

class Provider {
	#network;
	#url;
	#provider;
	#keepAliveInterval;
	#pingTimeout;
	#connectCB;
	
	#enableSubscribeCheck = false;
	#lastBlock = 0;
	#lastBlockFromEvent = 0;
	#lastBlockInterval;

	constructor(network, enableSubscribeCheck = false) {
		this.#network = network;
		this.#enableSubscribeCheck = enableSubscribeCheck;
		this.#url = conf.ws_nodes[network];
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
		return this.#provider;
	}

	connect(cb) {
		if (cb) {
			this.#connectCB = cb;
		}
		this.#createProvider();
	}

	#closeFromCheck() {
		this.#provider._websocket.terminate();
		this.#lastBlock = 0;
		this.#lastBlockFromEvent = 0;
	}
	
	#startSubscribeCheck() {
		this.#lastBlockInterval = setInterval(async () => {
			if (this.#lastBlock === this.#lastBlockFromEvent) {
				console.log('check failed');
				this.#closeFromCheck();
				return;
			}
			
			this.#lastBlock = this.#lastBlockFromEvent;
		}, CHECK_INTERVAL);
	}

	#createProvider() {
		console.log(`[Provider[${this.#network}].ws] create provider`);
		this.#provider = new ethers.providers.WebSocketProvider(this.#url);
		this.#provider._websocket.on('open', this.#onOpen.bind(this));
		this.#provider._websocket.on('close', this.#onClose.bind(this));
		this.#provider._websocket.on('error', this.#onError.bind(this));
		this.#provider._websocket.on('pong', this.#onPong.bind(this));
		
		this.#provider.on('block', (lastBlock) => {
			this.#lastBlockFromEvent = lastBlock;
		})
	}

	#onOpen() {
		this.#keepAliveInterval = setInterval(() => {
			this.#provider._websocket.ping()
			this.#pingTimeout = setTimeout(() => {
				console.log('[Provider[${this.#network}].ws] timeout');
				this.#provider._websocket.terminate()
			}, PING_TIMEOUT);
		}, PING_INTERVAL);
		this.#connectCB();
		
		if (this.#enableSubscribeCheck) {
			this.#startSubscribeCheck();
		}
	}

	#onPong() {
		clearInterval(this.#pingTimeout);
	}

	#onError(error) {
		console.log(`[Provider[${this.#network}].ws_error]:`, error);
		this.#provider._websocket.close();
	}

	async #onClose(code, message) {
		console.log(`[Provider[${this.#network}].ws_close]:`, code, message);
		clearInterval(this.#keepAliveInterval)
		clearTimeout(this.#pingTimeout)
		clearInterval(this.#lastBlockInterval);
		await sleep(5);
		this.connect();
	}
}


module.exports = Provider;
