const oldReportError = window.reportError;
const vscode = acquireVsCodeApi();

window.reportError = function(msg, file, line, column, error) {
	// ChoiceScript error messages are in the format
	//   "[scene] line [#]: [message]"
	var results = /(\S+) line (\d+): (.+)/.exec(msg);
	if (results !== null) {
		const err = {
			scene: results[1],
			line: results[2],
			message: results[3]
		};
		vscode.postMessage({
			command: 'error',
			text: `Bug at line ${err.line} in ${err.scene}:\n\t${err.message}`
		});
		vscode.postMessage({
			command: 'annotate',
			...err
		});
	}
	oldReportError(msg, file, line, column, error);
};
