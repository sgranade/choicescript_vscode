import { GameRunnerProvider } from '../common/game-runner-service';

export class EmptyGameRunner implements GameRunnerProvider {

	public async _init() {
		return;
	}

	/**
	 * Run the game.
	 */
	public async run(): Promise<void> {
		return;
	}

	public updateScenePath(gameId: string, path: string) {
		return;
	}

	public updateImagePath(gameId: string, path: string) {
		return;
	}

	get gameId() {
		return '';
	}
}
