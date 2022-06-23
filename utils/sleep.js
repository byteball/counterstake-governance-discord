function sleep(timeInSeconds) {
	return new Promise(resolve => setTimeout(resolve, timeInSeconds * 1000));
}

module.exports = sleep;
