import { StatusBarController } from './status-bar-controller';

export class GameRunnerService {
	constructor(
		private _provider: GameRunnerProvider | undefined,
		private _controller: StatusBarController,
	) {}

	public async run() {
		await this._provider?.run();
		this._controller.gameRun();
	}

	get isAvailable() {
		return !!this._provider;
	}
}

export interface GameRunnerProvider {
	run: () => Promise<void>;
	updateScenePath: (gameId: string, path: string) => void;
	updateImagePath: (gameId: string, path: string) => void;
	gameId: string;
	_init: () => Promise<void>;
}
