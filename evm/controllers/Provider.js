const conf = require('ocore/conf');
const { ethers } = require("ethers");

const sleep = require('../../utils/sleep');

const PING_INTERVAL = 5000;
const PING_TIMEOUT = 15000;

class Provider {
	#network;
	#url;
	#provider;
	#keepAliveInterval;
	#pingTimeout;
	#connectCB;

	constructor(network) {
		this.#network = network;
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

	#createProvider() {
		console.error(`[Provider[${this.#network}].ws] create provider`);
		this.#provider = new ethers.providers.WebSocketProvider(this.#url);
		this.#provider._websocket.on('open', this.#onOpen.bind(this));
		this.#provider._websocket.on('close', this.#onClose.bind(this));
		this.#provider._websocket.on('error', this.#onError.bind(this));
		this.#provider._websocket.on('pong', this.#onPong.bind(this));
	}

	#onOpen() {
		this.#keepAliveInterval = setInterval(() => {
			this.#provider._websocket.ping()
			this.#pingTimeout = setTimeout(() => {
				this.#provider._websocket.terminate()
			}, PING_TIMEOUT);
		}, PING_INTERVAL);
		this.#connectCB();
	}

	#onPong() {
		clearInterval(this.#pingTimeout);
	}

	#onError(error) {
		console.error(`[Provider[${this.#network}].ws_error]:`, error);
		this.#provider._websocket.close();
	}

	async #onClose(code, message) {
		console.error(`[Provider[${this.#network}].ws_close]:`, code, message);
		clearInterval(this.#keepAliveInterval)
		clearTimeout(this.#pingTimeout)
		await sleep(5);
		this.connect();
	}
}


module.exports = Provider;
