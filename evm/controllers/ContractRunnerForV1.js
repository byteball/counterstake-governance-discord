const mutex = require('ocore/mutex');
const Moralis = require("moralis/node");
const { ethers } = require("ethers");

const sleep = require('../../utils/sleep')
const getChainNameForMoralis = require('../../utils/getChainNameForMoralis');
const Web3_addresses = require('../../db/Web3_addresses');
const { getAbiByType } = require('../abi/getAbiByType');
const { getInternalTransactions } = require('../api/getInternalTransactions');
const { eventsForV1 } = require('../eventsForV1');
const DataFetcher = require('./DataFetcher');
const Formatter = require('./Formatter');
const Discord = require("./Discord");

class ContractRunnerForV1 {
	#contracts = {};
	#providers = {};

	constructor(intervalInMinutes = 30) {
		setInterval(this.#exec.bind(this), intervalInMinutes * 60 * 1000);
	}

	static #getNameAndDateFromInput(input, type) {
		const metaForDecode = eventsForV1[type];
		if (!metaForDecode) {
			console.error('!type', type);
			return;
		}

		const event = metaForDecode.events.find(v => input.startsWith(v.sighash));
		if (!event) {
			console.error('!event', type, input);
			return;
		}

		let data = metaForDecode.iface.decodeFunctionData(event.name, input);
		return {
			name: event.name,
			data,
		}
	}

	setProvider(name, provider) {
		this.#providers[name] = provider;
	}

	setContracts(network, contracts) {
		this.#contracts[network] = contracts;
		this.#delayedExec();
	}

	async #delayedExec(timeInSeconds = 30) {
		const unlock = await mutex.lockOrSkip('ContractManagerOfV1.delayedExec');
		if (!unlock) {
			return;
		}
		await sleep(timeInSeconds);
		this.#exec();
		unlock();
	}

	async #getTransactions(chain, address, lastBlock, r = 0) {
		const options = {
			chain,
			address,
			from_block: lastBlock,
		};

		let transactions
		try {
			transactions = await Moralis.Web3API.account.getTransactions(options);
			console.error('getTransactions: done');
		} catch (e) {
			if (!r || r <= 2) {
				console.error('repeat getTransactions');
				await sleep(20);
				return this.#getTransactions(chain, address, lastBlock, !r ? 1 : ++r);
			}
			console.error(e);
			return [];
		}
		return transactions.result.filter(v => v.to_address === address.toLowerCase()).reverse();
	}

	async #preparingEventFromInput(network, transaction, contract) {
		const { input, from_address, hash } = transaction;
		const { type, name: contract_name, address, meta } = contract;

		const { name, data } = ContractRunnerForV1.#getNameAndDateFromInput(input, type);
		let event = {
			aa_address: address,
			trigger_address: from_address,
			trigger_unit: hash,
			name: contract_name,
		}

		console.error(event, name);

		if (name.startsWith('deposit')) {
			const transactions = await getInternalTransactions(meta.network, hash);
			event.type = 'deposit';
			event.amount = transactions.length ? transactions[0].value : 0;

			console.error('event=', event);
			return event;
		}

		if (name.startsWith("withdraw")) {
			const transactions = await getInternalTransactions(meta.network, hash);
			event.type = 'withdraw';
			event.amount = transactions.length ? transactions[0].value : 0;

			console.error('event=', event);
			return event;
		}

		if (name === "voteAndDeposit" || name === "vote") {
			const governance = new ethers.Contract(meta.governance_address, getAbiByType('governance'), this.#providers[network]);
			const balance = await governance.balances(from_address);

			const c = new ethers.Contract(address, getAbiByType(type), this.#providers[network]);
			const {
				leader_value,
				leader_support,
				support,
				value,
			} = type === 'UintArray' ? await DataFetcher.fetchVotedArrayData(c, data) : await DataFetcher.fetchVotedData(c, data);

			event.type = "added_support";
			event.added_support = balance.toString();
			event.leader_support = leader_support.toString();
			event.leader_value = Formatter.format(contract_name, leader_value, meta);
			event.value = Formatter.format(contract_name, value, meta);
			event.support = support.toString();

			console.error('event=', event);
			return event;
		}

		if (name === 'unvote') {
			const c = new ethers.Contract(address, getAbiByType(type), this.#providers[network]);
			const {
				leader_value,
				leader_support,
			} = type === 'UintArray' ? await DataFetcher.fetchVotedArrayData(c) : await DataFetcher.fetchVotedData(c);
			event.type = 'removed_support';
			event.leader_support = leader_support.toString();
			event.leader_value = Formatter.format(contract_name, leader_value, meta);

			console.error('event=', event);
			return event;
		}
	}

	async #exec() {
		const unlock = await mutex.lockOrSkip('ContractManagerOfV1.exec');
		if (!unlock) {
			return;
		}
		console.error('exec start', (new Date()).toISOString());
		for (let network in this.#contracts) {
			const chainName = getChainNameForMoralis(network, !!process.env.testnet);
			const c = this.#contracts[network];
			if (!c) continue;

			for (let i = 0; i < c.length; i++) {
				const contract = c[i];
				const meta = contract.meta;
				const lastBlock = await Web3_addresses.getLastBlockByAddress(contract.address);
				const transactions = await this.#getTransactions(chainName, contract.address, lastBlock);
				if (transactions.length) {
					let lb = lastBlock;
					for (let j = 0; j < transactions.length; j++) {
						let transaction = transactions[j];
						const event = await this.#preparingEventFromInput(network, transaction, contract);
						Discord.announceEvent(meta, event);
						lb = transaction.block_number;
					}
					await Web3_addresses.setLastBlockByAddress(contract.address, Number(lb) + 1);
				}
				await sleep(2);
			}
		}
		console.error('exec done', (new Date()).toISOString());
		unlock();
	}
}


module.exports = ContractRunnerForV1;
