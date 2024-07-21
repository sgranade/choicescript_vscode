import * as cp from 'child_process';
import * as fs from 'fs';
import * as vscode from 'vscode';
import type { integer } from 'vscode-languageclient';
import { CustomContext, Configuration, LocalWorkspaceStorageKeys, RandomtestPutResultsInDocumentOptions, RandomtestSettingsSource } from '../common/constants';
import { getWorkspaceStorageService } from '../common/localStorageService';
import { type Provider, generateLogUri, logUriToFilename } from '../common/logDocProvider';
import LogDocument from '../common/logDocument';
import { MultiStepInput } from '../common/multiStepInput';


// VS Code has a [20 MB limit on file sizes that it'll let extensions open](https://github.com/jjuback/gc-excelviewer/issues/49)
const FILE_SIZE_LIMIT = 20*1024*1024;

const ITERATION_COUNT_STRING = "*****Iteration ";

const outputChannel = vscode.window.createOutputChannel("ChoiceScript Test");
let runningProcess: cp.ChildProcess;

interface randomtestSettings {
	iterations: integer,
	seed: integer,
	showText: boolean,
	avoidUsedOptions: boolean,
	showChoices: boolean,
	showCoverage: boolean,
	putResultsInDocument: boolean,
	putResultsInUniqueDocument: boolean
}


/**
 * Initialize ChoiceScript test provider.
 */
export function initializeTestProvider(): void {
	// If we've already got previous randomtest settings, pull them in
	if (getPreviousRandomtestSettings()) {
		vscode.commands.executeCommand('setContext', CustomContext.PreviousRandomtestSettingsExist, true);
	}
}


/**
 * Get settings from the most recently run Randomtest.
 * 
 * @returns Previous Randomtest settings, or undefined if none exist.
 */
function getPreviousRandomtestSettings(): randomtestSettings | null {
	const localWSStorage = getWorkspaceStorageService();
	return localWSStorage.getValue<randomtestSettings>(LocalWorkspaceStorageKeys.PreviousRandomtestSettings);
}


/**
 * Update settings from the most recently run Randomtest.
 * 
 * @param newSettings Settings from the most recent Randomtest.
 */
function updatePreviousRandomtestSettings(newSettings: randomtestSettings) {
	const localWSStorage = getWorkspaceStorageService();
	localWSStorage.setValue<randomtestSettings>(LocalWorkspaceStorageKeys.PreviousRandomtestSettings, newSettings);
	vscode.commands.executeCommand('setContext', CustomContext.PreviousRandomtestSettingsExist, true);
}


/**
 * Show a log document in a new window.
 * 
 * @param document Document to show.
 */
async function showLogDocument(document: LogDocument) {
	if (document.length > 300000) {
		// Document is too long to be shown as a virtual document, so save to disk and show it that way
		const filename = logUriToFilename(document.uri);
		if (filename === undefined) {
			vscode.window.showErrorMessage(`Could not save test log file from ${document.uri.path}`, 'OK');
			return;
		}
		if (vscode.workspace.workspaceFolders === undefined) {
			vscode.window.showErrorMessage(`Could not save test log file; no workspace open`, 'OK');
			return;
		}
		else {
			vscode.window.setStatusBarMessage(`Too much test output; saving results to ${filename}`, 5000);
			const fileUri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, filename);
			const stream = fs.createWriteStream(fileUri.fsPath);
			let error = false;

			document.lines.forEach(line => stream.write(line+"\n"));

			stream.on('close', () => {
				if (!error) {
					// VS Code won't let us open files if they are too chumby
					const fileSize = fs.statSync(fileUri.fsPath).size;
					if (fileSize > FILE_SIZE_LIMIT) {
						vscode.window.showInformationMessage(
							`Test results saved to ${filename} but the file is too large to automatically open`, 'OK'
						);
					}
					else {
						vscode.workspace.openTextDocument(fileUri).then(
							doc => vscode.window.showTextDocument(
								doc, (vscode.window.activeTextEditor.viewColumn ?? 0) + 1
							),
							reason => {
								vscode.window.showErrorMessage(
									`Couldn't open test results from ${filename}: ${reason}`
								);
							}
						);
					}
				}
			});

			stream.on('error', (err) => {
				error = true;
				vscode.window.showErrorMessage(`Failed to write the test log file: ${err}`, 'OK');
			});

			stream.close();
		}
	}
	else {
		vscode.workspace.openTextDocument(document.uri).then(
			doc => vscode.window.showTextDocument(
				doc, (vscode.window.activeTextEditor?.viewColumn ?? 0) + 1
			)
		);
	}
}


/**
 * Get the settings for a randomtest run.
 * 
 * @param source Where to get the test settings: VS Code configuration, previous run, or interactive.
 */
async function getRandomtestSettings(source: RandomtestSettingsSource): Promise<randomtestSettings> {
	const title = 'Randomtest Settings';
	const config = vscode.workspace.getConfiguration(Configuration.BaseSection);
	let settings: randomtestSettings = {
		iterations: config.get(Configuration.RandomtestIterations),
		seed: config.get(Configuration.RandomtestSeed),
		showText: config.get(Configuration.RandomtestShowFullText),
		avoidUsedOptions: config.get(Configuration.RandomtestAvoidUsedOptions),
		showChoices: config.get(Configuration.RandomtestShowChoices),
		showCoverage: config.get(Configuration.RandomtestShowLineCoverageStatistics),
		putResultsInUniqueDocument: config.get(Configuration.RandomtestPutResultsInUniqueDocument),
		putResultsInDocument: false  // placeholder -- will be updated at end
	};

	if (source == RandomtestSettingsSource.LastTestRun) {
		const previousRandomtestSettings = getPreviousRandomtestSettings();
		if (previousRandomtestSettings) {
			settings = previousRandomtestSettings;
			// The `putResultsInUniqueDocument` setting should always reflect the user's current settings
			settings.putResultsInUniqueDocument = config.get(Configuration.RandomtestPutResultsInUniqueDocument);
		}
	}
	else if (source == RandomtestSettingsSource.Interactive) {
		const booleanGroups: vscode.QuickPickItem[] = ['yes', 'no']
			.map(label => ({ label }));

		interface State {
			title: string;
			step: number;
			totalSteps: number;
			settings: randomtestSettings;
			runtime: vscode.QuickPickItem;
		}

		async function collectInputs() {
			const state = { settings: settings } as Partial<State>;
			await MultiStepInput.run(input => pickIterations(input, state));
			return state as State;
		}

		async function pickIterations(input: MultiStepInput, state: Partial<State>) {
			state.settings.iterations = parseInt(await input.showInputBox({
				title,
				step: 1,
				totalSteps: 6,
				value: state.settings.iterations.toString(),
				prompt: 'Number of times to run randomtest',
				validate: validateInt,
				shouldResume: shouldResume
			}));
			return (input: MultiStepInput) => pickSeed(input, state);
		}

		async function pickSeed(input: MultiStepInput, state: Partial<State>) {
			state.settings.seed = parseInt(await input.showInputBox({
				title,
				step: 2,
				totalSteps: 6,
				value: state.settings.seed.toString(),
				prompt: 'Choose a random seed',
				validate: validateInt,
				shouldResume: shouldResume
			}));
			return (input: MultiStepInput) => pickShowText(input, state);
		}

		async function pickShowText(input: MultiStepInput, state: Partial<State>) {
			const pick = await input.showQuickPick({
				title,
				step: 3,
				totalSteps: 6,
				placeholder: 'Show the full text that randomtest encounters',
				items: booleanGroups,
				activeItem: booleanGroups[state.settings.showText ? 0 : 1],
				shouldResume: shouldResume
			});
			state.settings.showText = pick.label == 'yes';
			return (input: MultiStepInput) => pickAvoidUsedOptions(input, state);
		}

		async function pickAvoidUsedOptions(input: MultiStepInput, state: Partial<State>) {
			const pick = await input.showQuickPick({
				title,
				step: 4,
				totalSteps: 6,
				placeholder: 'Avoid used options',
				items: booleanGroups,
				activeItem: booleanGroups[state.settings.avoidUsedOptions ? 0 : 1],
				shouldResume: shouldResume
			});
			state.settings.avoidUsedOptions = pick.label == 'yes';
			return (input: MultiStepInput) => pickShowChoices(input, state);
		}

		async function pickShowChoices(input: MultiStepInput, state: Partial<State>) {
			const pick = await input.showQuickPick({
				title,
				step: 5,
				totalSteps: 6,
				placeholder: 'Show choices that randomtest makes',
				items: booleanGroups,
				activeItem: booleanGroups[state.settings.showChoices ? 0 : 1],
				shouldResume: shouldResume
			});
			state.settings.showChoices = pick.label == 'yes';
			return (input: MultiStepInput) => pickShowCoverage(input, state);
		}

		async function pickShowCoverage(input: MultiStepInput, state: Partial<State>) {
			const pick = await input.showQuickPick({
				title,
				step: 6,
				totalSteps: 6,
				placeholder: 'After the test, show how many times each line was encountered',
				items: booleanGroups,
				activeItem: booleanGroups[state.settings.showCoverage ? 0 : 1],
				shouldResume: shouldResume
			});
			state.settings.showCoverage = pick.label == 'yes';
		}

		function shouldResume() {
			// Could show a notification with the option to resume.
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			return new Promise<boolean>((resolve, reject) => {
				// noop
			});
		}

		async function validateInt(entry: string) {
			await new Promise(resolve => setTimeout(resolve, 100));
			const n = Math.floor(Number(entry));
			return (n !== Infinity && String(n) === entry && n >= 0) ? undefined : 'Not an integer';
		}

		const state = await collectInputs();
		settings = state.settings;
	}

	const putResultsInDocumentConfig = config.get(Configuration.RandomtestPutResultsInDocument);
	settings.putResultsInDocument = (
		(putResultsInDocumentConfig === RandomtestPutResultsInDocumentOptions.Always) ||
		(putResultsInDocumentConfig === RandomtestPutResultsInDocumentOptions.Fulltext && settings.showText)
	);
	return settings;
}


/**
 * Run ChoiceScript's Quicktest.
 * 
 * @param testScriptPath Path to the test script.
 * @param csPath Path to the ChoiceScript module.
 * @param scenePath Path to the scene files.
 * @param imagePath Path to the image files.
 * @param csErrorHandler Optional handler for if the test finds an error.
 * @param statusCallback Optional callback for when tests are running or not.
 */
export function runQuicktest(
	testScriptPath: string, 
	csPath: string,
	scenePath: string,
	imagePath: string,
	csErrorHandler?: (scene: string, line: integer, message: string) => void,
	statusCallback?: (running: boolean) => void
): void {
	if (imagePath === undefined) {
		imagePath = ".";
	}
	const args = [csPath, scenePath, "", imagePath];
	runTest('Quicktest', testScriptPath, args, outputChannel, csErrorHandler, statusCallback);
}


/**
 * Run ChoiceScript's Randomtest.
 * 
 * @param testScriptPath Path to the test script.
 * @param csPath Path to the ChoiceScript module.
 * @param scenePath Path to the scene files.
 * @param source Where to get the Randomtest settings: VS Code configuration, a previous run, or interactively.
 * @param provider Provider to generate log documents.
 * @param csErrorHandler Optional handler for if the test finds an error.
 * @param statusCallback Optional callback for when tests are running or not.
 */
export async function runRandomtest(
	testScriptPath: string, 
	csPath: string,
	scenePath: string,
	source: RandomtestSettingsSource,
	provider: Provider,
	csErrorHandler?: (scene: string, line: integer, message: string) => void,
	statusCallback?: (running: boolean) => void,
	testCountCallback?: (count: integer) => void
): Promise<void> {
	const settings = await getRandomtestSettings(source);
	const args = [
		`cs=${csPath}`,
		`project=${scenePath}`,
		`num=${settings.iterations}`,
		`seed=${settings.seed}`,
		`showText=${settings.showText}`,
		`avoidUsedOptions=${settings.avoidUsedOptions}`,
		`showChoices=${settings.showChoices}`,
		`showCoverage=${settings.showCoverage}`,
		'saveStats=true'  // Always save the stats
	];
	const output = (settings.putResultsInDocument) ? provider.getLogDocument(generateLogUri("Randomtest", settings.putResultsInUniqueDocument)) : outputChannel;

	updatePreviousRandomtestSettings(settings);

	runTest('Randomtest', testScriptPath, args, output, csErrorHandler, statusCallback, testCountCallback);
}


/**
 * Run a ChoiceScript test.
 * 
 * @param testName Name of the test (such as "quicktest").
 * @param testScriptPath Path to the test script.
 * @param testArgs Arguments to pass to the test script.
 * @param output Where to send the output from the run.
 * @param csErrorHandler Optional handler for if the test finds an error.
 * @param statusCallback Optional callback for when tests are running or not.
 * @param testCountCallback Optional callback for the count of random tests.
 * @param successCallback Optional callback after a test for whether it succeeded or not.
 */
function runTest(
	testName: string,
	testScriptPath: string,
	testArgs: string[],
	output: vscode.OutputChannel | LogDocument,
	csErrorHandler?: (scene: string, line: integer, message: string) => void,
	statusCallback?: (running: boolean) => void,
	testCountCallback?: (count: integer) => void,
	successCallback?: (running: boolean) => void
) {
	let lastLine: string;

	if (runningProcess !== undefined) {
		vscode.window.showErrorMessage("A test is already running");
		return;
	}

	vscode.commands.executeCommand('setContext', CustomContext.TestRunning, true);
	if (statusCallback !== undefined) {
		statusCallback(true);
	}
	output.clear();
	output.show();
	output.appendLine(`${testName} started on ${Date().toString()}`);

	runningProcess = cp.fork(testScriptPath, testArgs, { stdio: 'pipe' });

	runningProcess.stdout.setEncoding('utf-8');
	runningProcess.stdout.on('data', (data: Buffer) => {
		lastLine = data.toString();
		// We need to get rid of at most one carriage return at the end of the line, to handle
		// the corner case where the incoming line ends with a blank line (trimEnd() would
		// get rid of both \n's in that case)
		if (lastLine.charAt(lastLine.length-1) == '\n') {
			lastLine = lastLine.slice(0, -1);
		}
		output.append(lastLine);

		// See if there's an iteration count in the output if necessary
		if (testCountCallback !== undefined) {
			let ndx = lastLine.indexOf(ITERATION_COUNT_STRING);
			if (ndx != -1) {
				ndx += ITERATION_COUNT_STRING.length; 
				const endNdx = lastLine.indexOf(" ", ndx);
				if (endNdx > ndx) {
					const iteration = Number(lastLine.slice(ndx, endNdx));
					testCountCallback(iteration);
				}
			}
		}

		// Save the last line since it can have error information
		lastLine = lastLine.trim().split('\n').pop();  // Since I may get multiple lines at once
	});

	runningProcess.stderr.setEncoding('utf-8');
	runningProcess.stderr.on('data', (data: Buffer) => {
		output.appendLine("Error:");
		output.append(data.toString());
	});

	runningProcess.on('error', (data: Buffer) => {
		output.appendLine("Process error:");
		output.append(data.toString());
	});

	runningProcess.on('exit', async (code?: number, signal?: string) => {
		let success = false;
		runningProcess = undefined;
		output.appendLine(`\n${testName} finished on ${Date().toString()}`);
		vscode.commands.executeCommand('setContext', CustomContext.TestRunning, false);
		if (statusCallback !== undefined) {
			statusCallback!(false);
		}
		if (output instanceof LogDocument) {
			showLogDocument(output);
		}
		if (code !== undefined) {
			if (code == 0) {
				vscode.window.setStatusBarMessage(`${testName} passed`, 5000);
				success = true;
			}
			else if (signal == 'SIGTERM') {
				vscode.window.setStatusBarMessage(`${testName} stopped`, 5000);
			}
			else {
				if (csErrorHandler !== undefined) {
					// ChoiceScript error messages are in the format
					//   "[scene] line [#]: [message]" ...sometimes
					const results = /(\S+) line (\d+): (.+)/.exec(lastLine);
					if (results !== null) {
						csErrorHandler(results[1], parseInt(results[2]), results[3]);
					}
				}
				let msg = `${testName} failed`;
				if (lastLine !== undefined) {
					msg += `: ${lastLine}`;
				}
				vscode.window.showErrorMessage(msg, 'OK');
			}
		}
		else if (signal !== undefined) {
			vscode.window.showInformationMessage(`${testName} received unexpected signal: ${signal}`, 'OK');
		}
		if (successCallback !== undefined) {
			successCallback!(success);
		}
	});
}


/**
 * Cancel a test run.
 */
export function cancelTest(): void {
	if (runningProcess !== undefined) {
		runningProcess.kill();
	}
}