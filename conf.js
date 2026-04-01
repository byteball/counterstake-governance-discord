"use strict";
const path = require('path');
require('dotenv').config({ path: path.dirname(process.mainModule.paths[0]) + '/.env' });

function parseOptionalUtcTimestamp(value, envName) {
	if (value === undefined || value === null)
		return null;

	const trimmed = String(value).trim();
	if (!trimmed)
		return null;

	const normalized = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
		? `${trimmed}T00:00:00Z`
		: trimmed;

	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?Z$/.test(normalized))
		throw new Error(`Invalid ${envName}: expected ISO-8601 UTC date, got "${trimmed}"`);

	const timestampMs = Date.parse(normalized);
	if (!Number.isFinite(timestampMs))
		throw new Error(`Invalid ${envName}: expected ISO-8601 UTC date, got "${trimmed}"`);

	return Math.floor(timestampMs / 1000);
}

exports.bServeAsHub = false;
exports.bLight = true;

exports.bNoPassphrase = true;

exports.discord_token = process.env.discord_token;
exports.discord_channels = [process.env.channel];

exports.hub = process.env.testnet ? 'obyte.org/bb-test' : 'obyte.org/bb';
exports.explorer_base_url = process.env.testnet ? 'https://testnetexplorer.obyte.org/#' : 'https://explorer.obyte.org/#';
exports.counterstake_base_url = process.env.testnet ? 'https://testnet-bridge.counterstake.org/governance/' : 'https://counterstake.org/governance/';

exports.governance_export_base_AAs = [
	'HLNWXGGHGXWMZN27W2722MNJCHH2IVAO'
];
exports.governance_import_base_AAs = [
	'KDHCTQOTKTO6MLYOCU6OCBI7KK72DV3P'
];
exports.token_registry_AA_address = "O6H6ZIFI57X3PLTYHOCVYPP5A553CYFQ";

exports.cs_url = process.env.testnet ? 'https://testnet-bridge.counterstake.org/api' : 'https://counterstake.org/api';

exports.ws_nodes = {
	Ethereum: process.env.ws_nodes_Ethereum,
	BSC: process.env.ws_nodes_BSC,
	Polygon: process.env.ws_nodes_Polygon,
	Kava: process.env.ws_nodes_Kava,
}

exports.scan_api_keys = {
	Ethereum: process.env.eth_scan_api_key,
	BSC: process.env.bsc_scan_api_key,
	Polygon: process.env.polygon_scan_api_key,
};

exports.scan_start_timestamp = parseOptionalUtcTimestamp(process.env.scan_start_date, 'scan_start_date');

exports.evm_v1_1_history_days = Number(process.env.evm_v1_1_history_days || 1);
exports.evm_v1_1_history_interval_hours = Number(process.env.evm_v1_1_history_interval_hours || 12);
exports.evm_v1_1_history_confirmations = Number(process.env.evm_v1_1_history_confirmations || 12);
exports.evm_v1_1_history_max_log_range_blocks = Number(process.env.evm_v1_1_history_max_log_range_blocks || 10000);
exports.evm_v1_1_avg_block_time_seconds = {
	Ethereum: Number(process.env.evm_v1_1_avg_block_time_seconds_Ethereum || 12),
	BSC: Number(process.env.evm_v1_1_avg_block_time_seconds_BSC || 0.45),
	Polygon: Number(process.env.evm_v1_1_avg_block_time_seconds_Polygon || 2),
	Kava: Number(process.env.evm_v1_1_avg_block_time_seconds_Kava || 6),
};

console.log('finished server conf');
