"use strict";
const path = require('path');
require('dotenv').config({ path: path.dirname(process.mainModule.paths[0]) + '/.env' });

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

console.log('finished server conf');
