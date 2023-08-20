import { integer } from 'vscode-languageclient';
import { CsErrorHandler } from './client';
import { RandomtestSettingsSource } from './constants';
import { Provider } from './logDocProvider';

export interface ChoiceScriptTestProvider {
	initializeTestProvider(): void;
	cancelTest(): void;
	runQuicktest(
		testScriptPath: string,
		csPath: string,
		scenePath: string,
		imagePath: string,
		csErrorHandler?: CsErrorHandler,
		statusCallback?: (running: boolean) => void
	): void;
	runRandomtest(
		testScriptPath: string, 
		csPath: string,
		scenePath: string,
		source: RandomtestSettingsSource,
		provider: Provider,
		csErrorHandler?: (scene: string, line: integer, message: string) => void,
		statusCallback?: (running: boolean) => void,
		testCountCallback?: (count: integer) => void
	): void;
}
