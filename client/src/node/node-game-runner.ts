import * as vscode from 'vscode';
import { ChoiceScriptGameRunProvider } from '../common/game-runner-service';
import { CustomContext } from '../common/constants';
import * as gameserver from './gameserver';

export class NodeGameRunner implements ChoiceScriptGameRunProvider {
	private _gameId: string;

	constructor(
		private _csPath: string,
		private _csErrorHandler?: (scene: string, line: number, message: string) => void
	) {
		gameserver.startServer();
	}

	public async _init() {
		if (this._gameId === undefined) {
			this._gameId = await gameserver.createGame(this._csPath, this._csErrorHandler);
		}
	}

	/**
	 * Run the game.
	 */
	public async run(): Promise<void> {
		await this._init();
		gameserver.openGameInBrowser(this._gameId);
		vscode.commands.executeCommand('setContext', CustomContext.GameOpened, true);
	}

	public updateScenePath(gameId: string, path: string) {
		gameserver.updateScenePath(gameId, path);
	}

	public updateImagePath(gameId: string, path: string) {
		gameserver.updateImagePath(gameId, path);
	}

	get gameId() {
		return this._gameId;
	}
}
