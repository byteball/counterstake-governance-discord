const conf = require('ocore/conf');
const { ethers } = require("ethers");
const EventEmitter = require('node:events');

const sleep = require('../../utils/sleep');

class Provider {
	#network;
	#url;
	#connectCB;
	
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
		this.#createProvider();
	}
	
	close() {
		if (!this._provider || this._provider.destroyed) return;
		this._provider.websocket.removeAllListeners();
		this._provider.destroy();
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

	#onOpen() {
		this.#connectCB();
	}

	#onError(error) {
		console.error(`[Provider[${this.#network}].ws_error]:`, error);
		this.close();
	}

	async #onClose(code) {
		console.error(`[Provider[${this.#network}].ws_close]:`, code);
		this.events.emit('close');
		await sleep(2);
		this.connect();
	}
}


module.exports = Provider;
