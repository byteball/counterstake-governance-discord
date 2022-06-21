const { ethers, BigNumber } = require('ethers');

class Formatter {
	static format(name, value, meta) {
		console.log('name', name, value, meta);
		if (name === 'min_price20') {
			return ethers.utils.formatUnits(BigNumber.from(value), 20);
		}

		if (["ratio100", "counterstake_coef100"].includes(name)) {
			return Number(value) / 100;
		}

		if (["large_challenging_periods", "challenging_periods"].includes(name)) {
			return value.map((v) => Number(v) / 3600).join(" ");
		}

		if (["min_stake", "large_threshold"].includes(name)) {
			const amount = ethers.utils.formatUnits(BigNumber.from(value), meta.decimals);
			return `${amount} ${meta.symbol}`
		}

		return value;
	}
}

module.exports = Formatter;
