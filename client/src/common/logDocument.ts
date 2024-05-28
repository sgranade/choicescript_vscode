import type {EventEmitter, Uri} from 'vscode';


/**
 * Document containing a read-only log from a ChoiceScript process.
 */
export default class LogDocument {
	private readonly _uri: Uri;
	private readonly _emitter: EventEmitter<Uri>;
	private readonly _lines: string[];

	constructor(uri: Uri, emitter: EventEmitter<Uri>, header?: string) {
		this._uri = uri;
		this._emitter = emitter;
		this._lines = [];
		if (header !== undefined) {
			this._lines.push(header);
		}
	}

	get uri(): Uri {
		return this._uri;
	}

	get value(): string {
		return this._lines.join('\n');
	}

	get length(): number {
		return this._lines.length;
	}

	get lines(): readonly string[] {
		return this._lines;
	}

	private _append(lines: string[]) {
		this._lines.push(...lines);
		this._emitter.fire(this._uri);
	}

	// Implement OutputChannel methods so csTests can call them
	public appendLines(lines: string): void {
		this._append(lines.split('\n'));
	}
	
	public appendLine(line: string): void {
		this._append(line.split('\n'));
	}

	public append(line: string): void {
		this._append(line.split('\n'));
	}

	public clear(): void {
		while (this._lines.length) {
			this._lines.pop();
		}
		this._emitter.fire(this._uri);
	}

	public show(): void {
		// noop
	}
}
