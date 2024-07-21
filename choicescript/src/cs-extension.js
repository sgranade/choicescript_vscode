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

/**
 * IMAGE CONVERTOR (OUTGOING)
 * 
 * Webviews need all of their resources to be passed through asWebviewUri.
 * This is tricky to do with dynamic resources like user images and sound files.
 * 
 * What we do here is listen for the addition of image and audio tags within the webview DOM and make a request back
 * to the extension for the webview uri.
 */
window.addEventListener('DOMContentLoaded', () => {
	var mutationObserver = new MutationObserver(function(mutations) {
		mutations.forEach(function(mutation) {
		  if (mutation.type === "childList") {
			  if (Array.from(mutation.addedNodes).length > 0) {
				  const resources = Array.from(mutation.addedNodes).filter(n => ['IMG', 'AUDIO'].includes(n.nodeName));
				  if (resources.length > 0) {
					resources.forEach(r => vscode.postMessage({ command: 'convert-resource-uri', src: r.getAttribute("src"), nodeName: r.nodeName }));
				  }
			  }
		  }
		});
	  });
	  mutationObserver.observe(document.getElementsByTagName("body")[0], {
		childList: true,
		subtree: true
	  });
});


/**
 * IMAGE CONVERTOR (INCOMING)
 * 
 * Handle the extension responses to weburi conversion requests (as above).
 * When we receive an updated URI source we use the old URI source to find the appropriate
 * element and update it accordingly, allowing it to load.
 */
window.addEventListener('message', event => {

	const message = event.data;

	switch (message.command) {
		case 'update-resource-uri':
			const resource = Array.from(document.getElementsByTagName(message.nodeName)).find(i => i.getAttribute("src") === message.oldSrc);
			if (resource) {
				resource.src = message.newSrc;
			}
			break;
	}
});