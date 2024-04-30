const oldReportError = window.reportError;
const vscode = acquireVsCodeApi();

const setLabelTargetData = (annotationData, msg) => {
	annotationData.scene = window.stats.scene.targetLabel.origin;
	annotationData.line = window.stats.scene.targetLabel.originLine + 1;
	annotationData.label = window.stats.scene.targetLabel.label;
	annotationData.message = msg;
	return annotationData;
};

window.reportError = function(msg, file, line, column, error) {
	// ChoiceScript error messages are in the format
	//   "[scene] line [#]: [message]"
	const lineErrorMsgRegEx = new RegExp(/(\S+) line (\d+): (.+)/);
	const sceneLoadErrorRegex = new RegExp(/Couldn't load scene (.+)/);
	const labelErrorRegex = new RegExp(/doesn't contain label (.+)/);

	let match;
	const annotationData = {
		scene: undefined,
		line: undefined,
		message: undefined,
		label: undefined
	};
	if ((match = sceneLoadErrorRegex.exec(msg))) {
		if (!window.stats.scene.targetLabel) {
			// ChoiceScript has no way of determining where a failed scene
			// was loaded from if it doesn't reference a label. PR opportunity?
			vscode.postMessage({ command: 'error', text: msg });
		} else {
			setLabelTargetData(annotationData, msg);
			vscode.postMessage({
				command: 'error',
				text: `Error at '${annotationData.scene}' line ${annotationData.line}: Failed to load scene '${window.stats.scene.name}'`
			});
		}
	} else if ((match = labelErrorRegex.exec(msg))) {
		setLabelTargetData(annotationData, msg);
		vscode.postMessage({
			command: 'error',
			text: `Error at '${annotationData.scene}' line ${annotationData.line}: Failed to load label '${annotationData.label}' in '${window.stats.scene.name}'`
		});
	} else if ((match = lineErrorMsgRegEx.exec(msg))) {
		annotationData.scene = match[1];
		annotationData.line = match[2];
		annotationData.message = match[3];
		vscode.postMessage({
			command: 'error',
			text: `Error at line ${annotationData.line} in '${annotationData.scene}'`
		});
	} else if (msg) {
		vscode.postMessage({
			command: 'error',
			text: `Error: ${msg}`
		});
	}
	if (annotationData.line) {
		vscode.postMessage({
			command: 'annotate',
			...annotationData
		});
	}
	oldReportError(msg, file, line, column, error);
};
