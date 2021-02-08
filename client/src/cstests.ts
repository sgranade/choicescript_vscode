import * as cp from 'child_process';
import * as vscode from 'vscode';
import { integer } from 'vscode-languageclient/node';
import { CustomCommands } from './constants';


const outputChannel = vscode.window.createOutputChannel("ChoiceScript Test");
var runningProcess: cp.ChildProcess;


/**
 * Run ChoiceScript's Quicktest.
 * 
 * @param testScriptPath Path to the test script.
 * @param csPath Path to the ChoiceScript module.
 * @param scenePath Path to the scene files.
 * @param csErrorHandler Optional handler if the test finds an error.
 */
export function runQuicktest(
	testScriptPath: string, 
	csPath: string, scenePath: string, 
	csErrorHandler?: (scene: string, line: integer, message: string) => void
) {
	var lastLine: string;

	if (runningProcess !== undefined) {
		vscode.window.showErrorMessage("Quicktest is already running");
		return;
	}

	vscode.commands.executeCommand('setContext', CustomCommands.TestRunning, true);
	outputChannel.clear();
	outputChannel.show();
	runningProcess = cp.fork(testScriptPath, [csPath, scenePath], { stdio: 'pipe' });

	runningProcess.stdout.setEncoding('utf-8');
	runningProcess.stdout.on('data', (data: Buffer) => {
		// Save the last line since it can have error information
		lastLine = data.toString();
		outputChannel.append(lastLine);
		lastLine = lastLine.trim().split('\n').pop();  // Since I may get multiple lines at once
	});

	runningProcess.stderr.setEncoding('utf-8');
	runningProcess.stderr.on('data', (data: Buffer) => {
		outputChannel.appendLine("Error:");
		outputChannel.append(data.toString());
	});

	runningProcess.on('error', (data: Buffer) => {
		outputChannel.appendLine("Process error:");
		outputChannel.append(data.toString());
	});

	runningProcess.on('exit', async (code?: number, signal?: string) => {
		runningProcess = undefined;
		vscode.commands.executeCommand('setContext', CustomCommands.TestRunning, false);
		if (code !== undefined) {
			if (code == 0) {
				await vscode.window.showInformationMessage("Quicktest passed", 'OK');
			}
			else if (signal == 'SIGTERM') {
				await vscode.window.showInformationMessage(`Quicktest stopped`, 'OK');
			}
			else {
				if (csErrorHandler !== undefined) {
					// ChoiceScript error messages are in the format
					//   "[scene] line [#]: [message]"
					var results = /(\S+) line (\d+): (.+)/.exec(lastLine);
					if (results !== null) {
						csErrorHandler(results[1], parseInt(results[2]), results[3]);
					}
				}
				await vscode.window.showErrorMessage(`Quicktest failed: ${lastLine}`, 'OK');
			}
		}
		else if (signal !== undefined) {
			await vscode.window.showInformationMessage(`Quicktest received unexpected signal: ${signal}`, 'OK');
		}
	});
}

export function cancelTest() {
	if (runningProcess !== undefined) {
		runningProcess.kill();
	}
}