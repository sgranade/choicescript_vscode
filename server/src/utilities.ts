import * as URI from 'urijs';
import { Diagnostic, DiagnosticSeverity, TextDocument, Location, Range, Position } from 'vscode-languageserver';

/**
 * Map that stores and accesses string keys without regard to case.
 */
export class CaseInsensitiveMap<T, U> extends Map<T, U> {
	set (key: T, value: U): this {
		if (typeof key === 'string') {
			key = <T><any>key.toLowerCase();
		}
		return super.set(key, value);
	}
	get(key: T): U | undefined {
		if (typeof key === 'string') {
			key = <T><any>key.toLowerCase();
		}
		return super.get(key);
	}
	has(key: T): boolean {
		if (typeof key === 'string') {
			key = <T><any>key.toLowerCase();
		}
		return super.has(key);
	}
}

/**
 * Convert a map to a case-insensitive map, combining array values instead of overwriting them.
 * @param map Original map.
 */
export function mapToUnionedCaseInsensitiveMap<K, V extends Array<any>>(map: Map<K, V>): CaseInsensitiveMap<K, V> {
	let newMap = new CaseInsensitiveMap<K, V>();
	for (let [key, value] of map) {
		let oldArray = newMap.get(key);
		if (oldArray !== undefined) {
			oldArray.push(...value);
		}
		else {
			newMap.set(key, value);
		}
	}

	return newMap;
}

export type ReadonlyCaseInsensitiveMap<K, V> = ReadonlyMap<K, V>;

/**
 * Determine if a string contains a number.
 */
export function stringIsNumber(s: string) {
	return !Number.isNaN(Number(s));
}

/**
 * Scan a document's text to find the beginning of the current line.
 * 
 * @param document Document text to scan.
 * @param startIndex Index at which to begin scan.
 * @returns Index corresponding to the line's beginning.
 */
export function findLineBegin(document: string, startIndex: number): number {
	let i = startIndex;
	let lineBegin: number = startIndex;
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
	let i = startIndex;
	let lineEnd: number;
	let lineEndPattern = /\r?\n|$/g;
	lineEndPattern.lastIndex = startIndex;
	let m = lineEndPattern.exec(document);
	if (m) {
		lineEnd = m.index + m[0].length;
	}
	else {
		lineEnd = document.length - 1;
	}

	return lineEnd;
}

/**
 * Scan text to find a matching delimiter, skipping escaped delimiters.
 * 
 * @param section Section of text to scan.
 * @param openDelimiter Delimiter that opens the group.
 * @param closeDelimiter Delimiter that closes the group.
 * @param startIndex Index inside of section where the delimited contents begin (after the opening delimiter).
 * @returns String contained within the delimiters, not including the closing delimiter.
 */
export function extractToMatchingDelimiter(section: string, openDelimiter: string, closeDelimiter: string, startIndex: number = 0): string | undefined {
	let match = RegExp(`(?<!\\\\)(\\${openDelimiter}|\\${closeDelimiter})`, 'g');
	match.lastIndex = startIndex;
	let matchEnd: number | undefined = undefined;
	let delimiterCount = 0;
	let extract: string | undefined = undefined;

	let m: RegExpExecArray | null;

	while (m = match.exec(section)) {
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

	if (matchEnd !== undefined)
		extract = section.slice(startIndex, matchEnd);
	return extract;
}

/**
* Normalize a URI.
* 
* @param uriString URI to normalize.
*/
export function normalizeUri(uriString: string): string {
   let uri = new URI(uriString);
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
	let uri = URI(uriString);
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
	let diagnostic: Diagnostic = {
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
	let diagnostic: Diagnostic = {
		severity: severity,
		range: location.range,
		message: message,
		source: 'ChoiceScript'
	};

	return diagnostic;
}