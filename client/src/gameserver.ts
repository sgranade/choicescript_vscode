import express = require('express');
import fs = require('fs');
import getPort = require('get-port');
import http = require('http');
import path = require('path');
import { env, Uri, window } from 'vscode';

export const CS_GAME_INDEX_PATH = "web/mygame/index.html"

/**
 * Get status of a path.
 * 
 * @param path Path to check.
 */
function getStat(path: string): Promise<fs.Stats> {
	return new Promise((resolve, reject) => {
		fs.stat(path, (err, stats: fs.Stats) => {
			if (err) {
				reject(err);
			} else {
				resolve(stats);
			}
		});
	});
}

/**
 * Get the index html file in a directory.
 * 
 * @param dirpath Path to the directory.
 * @param index Base name (without extension) for the index file.
 */
function getIndexFilename(dirpath: string, index: string = 'index'): Promise<string> {
	return new Promise((resolve, reject) => {
		const indexFiles: string[] = [
			`${index}.html`,
			`${index}.htm`
		];

		fs.readdir(dirpath, (err, files) => {
			if (err) {
				reject(err);
			} else {
				const indexFile = files.find((file: string) => {
					file = file.toLowerCase();
					return indexFiles.some((item) => item === file);
				});
				if (indexFile) {
					resolve(path.resolve(dirpath, indexFile));
				} else {
					reject(new Error(`file not found: ${dirpath}`));
				}
			}
		});
	});
}

export default class GameServer {
	private static nextPort: number = 52330;
	private server: http.Server | null;
	private rootPath: string;
	private port: number | null;
	private fileMap: Map<string, string>;
	private gameIndexFile: string | undefined;
	private csErrorCallback: (scene: string, line: number, message: string) => void | undefined;
	private _isDestroyed: boolean;

	/**
	 * @param rootPath Path to the root of the base ChoiceScript application.
	 * @param onCSError A callback for any ChoiceScript game errors.
	 */
	constructor(rootPath: string, onCSError?: (scene: string, line: number, message: string) => void) {
		this.server = null;
		this.rootPath = rootPath;
		this.port = null;
		this.fileMap = new Map();
		this.csErrorCallback = onCSError;
		this._isDestroyed = false;
	}

	/**
	 * Open a file in the browser once the server is running.
	 * 
	 * @param filename File to open.
	 */
	async openInBrowser(filename: string): Promise<void> {
		if (this.isDestroyed()) {
			return;
		}
		if (!this.isReady()) {
			await this.create().catch((err: Error) => {
				window.showErrorMessage(`Failed to create the browser server: ${err.message}`);
				throw err;
			});
		}

		const relativePath = path.relative(this.rootPath, filename);
		const url = `http://localhost:${this.port}/${relativePath.split(path.sep).join('/')}`;
		env.openExternal(Uri.parse(url));
	}

	public async create(): Promise<void> {
		if (this.isDestroyed() || this.isReady()) {
			return;
		}

		const app: express.Application = express();
		// TODO consider if it would work better to have a templated ChoiceScript HTML page
		// app.engine('html', require('TEMPLATE NAME'));
		// app.set('views', path.resolve(__dirname, '..', 'public/template'));
		// app.set('view engine', 'html');
		app.use(require('compression')());
		app.use(express.json());
		app.use(this._handleRequest.bind(this));
		app.use(this._handleCatch.bind(this));

		this.port = await getPort({port: GameServer.nextPort++});
		this.server = http.createServer(app);
		this.server.listen(this.port);

		return new Promise<void>((resolve, reject) => {
			const server = this.server as http.Server;
			server.on('listening', resolve);
			server.on('error', reject);
		});
	}

	/**
	 * Get the server's root path.
	 */
	public getRootPath(): string {
		return this.rootPath;
	}

	/**
	 * Update the server's root path from where it's serving files.
	 * 
	 * @param rootPath New root path.
	 */
	public setRootPath(rootPath: string): void {
		this.rootPath = rootPath;
	}
	
	/**
	 * Update mapping of requested files (by URL) to files in the local filesystem.
	 * 
	 * @param newMap New mapping.
	 */
	public setFileMap(newMap: Map<string, string>): void {
		this.fileMap = new Map(newMap);
	}

	/**
	 * Set the path to the game's index.html file.
	 * 
	 * @param file Fully-resolved path to the game index file.
	 */
	public setGameIndexFile(file: string | undefined): void {
		this.gameIndexFile = file;
	}

	/**
	 * Determine if the server is ready to serve.
	 */
	isReady(): boolean {
		return !!this.server && this.server.listening;
	}

	/**
	 * Determine if the server has been destroyed.
	 */
	isDestroyed(): boolean {
		return this._isDestroyed;
	}

	private _handleRequest(req: express.Request, res: express.Response, next: express.NextFunction): void {
		if (req.method == "GET") {
			this._serveFile(req, res, next);
		}
		else if (req.method == "POST") {
			this._handlePost(req, res, next);
		}
	}

	/**
	 * Serve a requested file.
	 */
	private _serveFile(req: express.Request, res: express.Response, next: express.NextFunction): void {
		const relativePath = decodeURIComponent(req.url).replace(/^\//, '');
		let filepath = path.resolve(this.rootPath, relativePath);
		if (this.gameIndexFile !== undefined && relativePath == CS_GAME_INDEX_PATH) {
			filepath = this.gameIndexFile;
		}
		else {
			// See if we need to swap out a filepath
			const altFilepath = this.fileMap.get(path.basename(filepath));
			if (altFilepath !== undefined) {
				filepath = altFilepath;
			}
		}
		getStat(filepath).then((stats) => {
			if (stats.isDirectory()) {
				getIndexFilename(filepath).then((indexFile) => {
					res.sendFile(indexFile);
				}).catch(() => {
					const error = new Error('404 Not Found');
					error.name = '404';
					next(error);
				});
			} else if (!stats.isFile()) {
				const err = new Error('404 Not Found');
				err.name = '404';
				next(err);
			} else {
				res.sendFile(filepath);
			}
		}).catch((err) => {
			err.name = '404';
			next(err);
		});
	}

	/**
	 * Handle POST messages.
	 */
	private _handlePost(req: express.Request, res: express.Response, next: express.NextFunction) {
		const relativePath = decodeURIComponent(req.url).replace(/^\//, '');
		if (relativePath !== 'cs-error') {
			return;
		}
		const scene = req.body['scene'];
		const line = parseInt(req.body['line']);
		const message = req.body['message'];
		if (this.csErrorCallback !== undefined) {
			this.csErrorCallback(scene, line, message);
		}
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	private _handleCatch(err: Error, req: express.Request, res: express.Response, next: express.NextFunction): void {
		if (err) {
			if (err.name === '404') {
				res.status(404);
			} else {
				res.status(500);
			}
			res.json({
				message: err.stack || err.message || '500 Error',
				error: err
			});
		} else {
			res.end();
		}
	}

	public dispose(): void {
		if (this.isDestroyed()) {
			return;
		}
		if (this.server && this.isReady()) {
			this.server.close();
		}
		this.server = null;
		this.port = null;
		this._isDestroyed = true;
	}
}