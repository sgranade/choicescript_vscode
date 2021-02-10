previousOnerror = window.onerror;

window.onerror = function(msg, file, line, stack) {
    if (msg) {
		// ChoiceScript error messages are in the format
		//   "[scene] line [#]: [message]"
		var results = /(\S+) line (\d+): (.+)/.exec(msg);
		if (results !== null) {
			var currentLocation = window.location;
			var url = `${currentLocation.protocol}//${currentLocation.host}/cs-error`;
			var xhr = new XMLHttpRequest();
			xhr.open("POST", url, true);
			xhr.setRequestHeader('Content-Type', 'application/json');
			xhr.send(JSON.stringify({
				scene: results[1],
				line: results[2],
				message: results[3]
			}));	
		}
    }
	previousOnerror(msg, file, line, stack);
}