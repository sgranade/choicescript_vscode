import { StatusBarController } from './status-bar-controller';

export class ChoiceScriptGameRunnerService {
	constructor(
		private _provider: ChoiceScriptGameRunProvider | undefined,
		private _controller: StatusBarController,
	) {}

	public async run() {
		await this._provider?.run();
		this._controller.gameRun();
	}
}

export interface ChoiceScriptGameRunProvider {
	run: () => Promise<void>;
	updateScenePath: (gameId: string, path: string) => void;
	updateImagePath: (gameId: string, path: string) => void;
	gameId: string;
	_init: () => Promise<void>;
}
