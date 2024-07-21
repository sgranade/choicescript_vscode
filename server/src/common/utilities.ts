import * as URI from 'urijs';
import type { Diagnostic, DiagnosticSeverity, Location, Range, Position } from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Map that stores and accesses string keys without regard to case.
 */
export class CaseInsensitiveMap<K, V> extends Map<K, V> {
	shadowMap: Map<K, K>;
	constructor(entries?: Iterable<readonly [K, V]> | null) {
		super();
		this.shadowMap = new Map();
		if (entries !== null && entries !== undefined) {
			for (const [key, val] of entries) {
				this.set(key, val);
			}
		}
	}
	set(key: K, value: V): this {
		if (typeof key === 'string') {
			const newKey = key.toLowerCase() as unknown as K;
			this.shadowMap.set(newKey, key);
			key = newKey;
		}
		return super.set(key, value);
	}
	get(key: K): V | undefined {
		if (typeof key === 'string') {
			key = key.toLowerCase() as unknown as K;
		}
		return super.get(key);
	}
	caseInsensitiveKeysToKeys(): Map<K, K> {
		return new Map(this.shadowMap.entries());
	}
	has(key: K): boolean {
		if (typeof key === 'string') {
			key = key.toLowerCase() as unknown as K;
		}
		return super.has(key);
	}
}

/**
 * Convert a map to a case-insensitive map, combining array values instead of overwriting them.
 * @param map Original map.
 */
export function mapToUnionedCaseInsensitiveMap<K, V extends unknown[]>(map: Map<K, V>): CaseInsensitiveMap<K, V> {
	const newMap = new CaseInsensitiveMap<K, V>();
	for (const [key, value] of map) {
		const oldArray = newMap.get(key);
		if (oldArray !== undefined) {
			oldArray.push(...value);
		}
		else {
			newMap.set(key, value);
		}
	}

	return newMap;
}

/**
 * Convert a case-insensitive map to a regular map, using the original case-sensitive keys.
 * @param map Original case-insensitive map.
 */
export function caseInsensitiveMapToMap<K, V>(map: ReadonlyCaseInsensitiveMap<K, V>): Map<K, V> {
	const keysToKeys = map.caseInsensitiveKeysToKeys();
	const newMap = new Map<K, V>();
	for (const [key, value] of map) {
		newMap.set(keysToKeys.get(key) ?? key, value);
	}

	return newMap;
}

export interface ReadonlyCaseInsensitiveMap<K, V> extends ReadonlyMap<K, V> {
	caseInsensitiveKeysToKeys(): Map<K, K>;
}

// export type ReadonlyCaseInsensitiveMap<K, V> = ReadonlyMap<K, V>;

/**
 * Generator for mapping a function over an iterable.
 * 
 * @param iterable Iterable to map over.
 * @param transform Function to map over iterable.
 */
export function* iteratorMap<T, U>(iterable: Iterable<T>, transform: (arg: T) => U): IterableIterator<U> {
	for (const item of iterable) {
		yield transform(item);
	}
}

/**
 * Generator for filtering an iterable.
 * 
 * @param iterable Iterable to filter over.
 * @param transform Function to map over iterable.
 */
export function* iteratorFilter<T>(iterable: Iterable<T>, filter: (arg: T) => boolean): IterableIterator<T> {
	for (const item of iterable) {
		if (filter(item))
			yield item;
	}
}

/**
 * Determine if a string contains a number.
 */
export function stringIsNumber(s: string): boolean {
	return !Number.isNaN(Number(s));
}

/**
 * If necessary, summarize text by cutting it off at a space between words.
 * @param text Text to summarize.
 * @param maxLength Max length of the summary.
 */
export function summarize(text: string, maxLength: number): string {
	if (text.length > maxLength) {
		const trimmedText = text.slice(0, maxLength);
		const m = /^(.*)(?: )/.exec(trimmedText);
		if (m !== null) {
			text = m[1] + "…";
		}
		else {
			text = trimmedText.slice(0, maxLength - 1) + "…";
		}
	}

	return text;
}

/**
 * Scan a document's text to find the beginning of the current line.
 * 
 * @param document Document text to scan.
 * @param startIndex Index at which to begin scan.
 * @returns Index corresponding to the line's beginning.
 */
export function findLineBegin(document: string, startIndex: number): number {
	let lineBegin = startIndex;
	while (document[lineBegin] != '\n' && lineBegin >= 0) {
		lineBegin--;
	}

	return lineBegin + 1;
}

/**
 * Scan a document's text to find the end of the current line.
 * 
 * @param document Document text to scan.
 * @param startIndex Index at which to begin scan.
 * @returns Index corresponding to one past the line's end, including any \r\n
 */
export function findLineEnd(document: string, startIndex: number): number {
	let lineEnd: number;
	const lineEndPattern = /\r?\n|$/g;
	lineEndPattern.lastIndex = startIndex;
	const m = lineEndPattern.exec(document);
	if (m) {
		lineEnd = m.index + m[0].length;
	}
	else {
		lineEnd = document.length - 1;
	}

	return lineEnd;
}

/**
 * New line read by readLine.
 */
export interface NewLine {
	line: string;
	splitLine?: {
		padding: string;
		contents: string;
	};
	index: number;
}

/**
 * Read a line, splitting it into leading padding and contents.
 * @param text Text containing the line.
 * @param lineStart Index to the start of the line.
 * @returns The line, or undefined if lineStart is at the end of text.
 */
export function readLine(text: string, lineStart: number): NewLine | undefined {
	let processedLine: NewLine;

	const lineEnd = findLineEnd(text, lineStart);
	if (lineStart == lineEnd) {
		return undefined;
	}
	const line = text.slice(lineStart, lineEnd);
	const m = /^([ \t]+)(.*)/.exec(line);
	if (!m) {
		processedLine = { line: line, index: lineStart };
	}
	else {
		processedLine = {
			line: line,
			splitLine: {
				padding: m[1],
				contents: m[2]
			},
			index: lineStart
		};
	}

	return processedLine;
}

// extractToMatchingDelimiter is called a _lot_, so caching the regexes we commonly use speeds
// everything up lots
const quoteSearch = /(?<!\\)"/g;
const bracketSearch = /[{}]/g;
const parensSearch = /[()]/g;

/**
 * Scan text to find a matching delimiter, skipping escaped delimiters.
 * 
 * @param text Text to scan.
 * @param openDelimiter Delimiter that opens the group.
 * @param closeDelimiter Delimiter that closes the group.
 * @param startIndex Index inside of text where the delimited contents begin (after the opening delimiter).
 * @returns String contained within the delimiters, not including the closing delimiter.
 */
export function extractToMatchingDelimiter(text: string, openDelimiter: string, closeDelimiter: string, startIndex = 0): string | undefined {
	let matchEnd: number | undefined = undefined;
	let delimiterCount = 0;
	let m: RegExpExecArray | null;
	let match: RegExp;

	let sameDelimiter = false;
	if (closeDelimiter == '}') {
		match = bracketSearch;
	}
	else if (closeDelimiter == '"') {
		match = quoteSearch;
		sameDelimiter = true;
	}
	else if (closeDelimiter == ')') {
		match = parensSearch;
	}
	else if (openDelimiter == closeDelimiter) {
		match = RegExp(`(?<!\\\\)\\${openDelimiter})`, 'g');
		sameDelimiter = true;
	}
	else {
		match = RegExp(`(?<!\\\\)(\\${openDelimiter}|\\${closeDelimiter})`, 'g');
	}

	// Break out the case where the open and close delimiter are the same for speeeeed
	if (sameDelimiter) {
		match.lastIndex = startIndex;

		matchEnd = text.search(match);
		if (matchEnd == -1) {
			return undefined;
		}
		return text.slice(startIndex, matchEnd);
	}
	else {
		match.lastIndex = startIndex;

		while ((m = match.exec(text))) {
			if (m[0] == closeDelimiter) {
				if (delimiterCount)
					delimiterCount--;
				else {
					matchEnd = m.index;
					break;
				}
			}
			else if (m[0] == openDelimiter) {
				delimiterCount++;
			}
		}
		if (matchEnd == undefined) {
			return undefined;
		}
		return text.slice(startIndex, matchEnd);
	}
}

/**
 * Read the next non-blank line.
 * @param text Text to read from.
 * @param lineStart Start of the next line.
 * @returns Next non-blank line or undefined if the end of the string is reached.
 */
export function readNextNonblankLine(text: string, lineStart: number): NewLine | undefined {
	let nextLine: NewLine | undefined;
	while (true) {
		nextLine = readLine(text, lineStart);
		if (nextLine === undefined) {
			break;
		}
		if (nextLine.line.trim() == "") {
			lineStart += nextLine.line.length;
		}
		else {
			break;
		}
	}
	return nextLine;
}

/**
 * Extract an indented block from text.
 * 
 * The extracted text includes the newline (if any) at the end of the block.
 * @param text Text to read from.
 * @param initialIndent Initial indent of the line that defines the block (like an *if command).
 * @param startIndex Index inside of text where the block begins (after the line that defines the block).
 */
export function extractToMatchingIndent(text: string, initialIndent: number, startIndex = 0): string {
	let lastIndex = startIndex;
	let nextLine: NewLine | undefined;

	while (true) {
		nextLine = readNextNonblankLine(text, lastIndex);
		if (nextLine === undefined || (nextLine.splitLine?.padding.length ?? 0) <= initialIndent) {
			break;
		}
		lastIndex = nextLine.index + nextLine.line.length;
	}
	return text.slice(startIndex, lastIndex);
}

/**
* Normalize a URI.
* 
* @param uriString URI to normalize.
*/
export function normalizeUri(uriString: string): string {
	const uri = new URI(uriString);
	return uri.normalize().toString();
}

/**
 * Extract the filename portion from a URI.
 * 
 * Note that, for URIs with no filename (such as file:///path/to/file), the final portion of the
 * path is returned.
 * 
 * @param uriString URI to extract the filename from.
 * @returns The filename, or null if none is found.
 */
export function getFilenameFromUri(uriString: string): string | undefined {
	const uri = URI(uriString);
	return uri.filename();
}

/**
 * Compare two positions.
 * @param pos1 First position.
 * @param pos2 Second position.
 * @returns -1 if pos1 is before pos2, 0 if they're equal, 1 if pos1 is after pos2.
 */
export function comparePositions(pos1: Position, pos2: Position): number {
	if (pos1.line == pos2.line && pos1.character == pos2.character) {
		return 0;
	}
	return (pos1.line > pos2.line || (pos1.line == pos2.line && pos1.character > pos2.character)) ? 1 : -1;
}

/**
 * Determine if a position is inside a range.
 * @param position Position.
 * @param range Range.
 */
export function positionInRange(position: Position, range: Range): boolean {
	return (comparePositions(position, range.start) >= 0 &&
		comparePositions(position, range.end) <= 0);
}

/**
 * Determine if one range is completely contained by a second.
 * @param range1 First range.
 * @param range2 Second range.
 */
export function rangeInOtherRange(range1: Range, range2: Range): boolean {
	return (comparePositions(range1.start, range2.start) >= 0 &&
		comparePositions(range1.end, range2.end) <= 0);
}

/**
 * Generate a diagnostic message.
 * 
 * Pass start and end locations as 0-based indexes into the document's text.
 * 
 * @param severity Diagnostic severity
 * @param textDocument Document to which the diagnostic applies.
 * @param start Start location in the text of the diagnostic message.
 * @param end End location in the text of the diagnostic message.
 * @param message Diagnostic message.
 */
export function createDiagnostic(severity: DiagnosticSeverity, textDocument: TextDocument,
	start: number, end: number, message: string): Diagnostic {
	const diagnostic: Diagnostic = {
		severity: severity,
		range: {
			start: textDocument.positionAt(start),
			end: textDocument.positionAt(end)
		},
		message: message,
		source: 'ChoiceScript'
	};

	return diagnostic;
}

/**
 * Generate a diagnostic message given a location.
 * 
 * @param severity Diagnostic severity
 * @param location Location of the message in the document.
 * @param message Diagnostic message.
 */
export function createDiagnosticFromLocation(
	severity: DiagnosticSeverity, location: Location,
	message: string): Diagnostic {
	const diagnostic: Diagnostic = {
		severity: severity,
		range: location.range,
		message: message,
		source: 'ChoiceScript'
	};

	return diagnostic;
}

/**
 * A simpler but browser-friendly re-implementation of Node's url fileURLToPath. 
 * It strips the protocol from a URI/URL and decodes some special characters.
 * 
 * @param url The URL to convert to a path.
 * @throws An error if the given string is not a URL/URI (i.e. has a protocol).
 */
export function fileURLToPath(url: string) {
	let path = decodeURIComponent(new URL(url).pathname);

	// Check for Windows-style paths, which will be `/[a-z]:/...`
	const winDrive = path.substring(0, 4);
	const winDriveLetter = (path.codePointAt(1) ?? 0) | 0x20;
	if (
		winDrive.startsWith('/') &&
		(winDrive.endsWith(':/') || winDrive.endsWith(':')) &&
		winDriveLetter >= 97 && // lower-case a
		winDriveLetter <= 122 // lower-case z
	) {
		path = `${path[1]}:/${path.substring(winDrive.length)}`;
	}

	return path;
}


/**
 * A simpler but browser-friendly re-implementation of Node's url pathToFileURL.
 * It takes a raw path, adds the 'file://' protocol and encodes some special characters.
 * 
 * @param path The URL to convert to a path.
 * @throws An error if the given string is not a URL/URI (i.e. has a protocol).
 */
export function pathToFileURL(path: string) {
	// Check for Windows-style paths, which start with "c:/"
	const winDriveLetter = (path.codePointAt(0) ?? 0) | 0x20;
	if (
		path.length >= 2 &&
		winDriveLetter >= 97 && // lower-case a
		winDriveLetter <= 122 && // lower-case z
		path[1] === ':'
	) {
		return `file:///${path[0]}:${encodeURI(path.substring(2))}`;
	}
	
	return `file://${encodeURI(path)}`;
}
