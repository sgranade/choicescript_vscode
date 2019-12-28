import * as URI from 'urijs';

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
}

export type ReadonlyCaseInsensitiveMap<K, V> = ReadonlyMap<K, V>;

/**
 * Determine if a string contains a number.
 */
export function stringIsNumber(s: string) {
	return !Number.isNaN(Number(s));
}

/**
 * Scan a document's text to find the end of the current line.
 * 
 * @param document Document text to scan.
 * @param startIndex Index at which to begin scan.
 * @returns Index corresponding to one past the line's end, including any \r\n
 */
export function findLineEnd(document: string, startIndex: number): number | undefined {
	let i = startIndex;
	let lineEnd: number | undefined = undefined;

	for (let i = startIndex; i < document.length; i++) {
		if (i < document.length - 2 && document[i] == '\r' && document[i+1] == '\n') {
			lineEnd = i+2;
			break;
		}
		if (i < document.length - 1 && document[i] == '\n') {
			lineEnd = i+1;
			break;
		}
		if (i == document.length - 1) {
			lineEnd = i+1;
			break;
		}
	}

	return lineEnd;
}

/**
 * Scan text to find a matching delimiter, skipping escaped delimiters.
 * 
 * The passed section should begin with the first character past the opening delimiter.
 * 
 * @param section Section of text to scan.
 * @param openDelimiter Delimiter that opens the group.
 * @param closeDelimiter Delimiter that closes the group.
 * @returns String contained within the delimiters.
 */
export function extractToMatchingDelimiter(section: string, openDelimiter: string, closeDelimiter: string): string | undefined {
	let match = RegExp(`(?<!\\\\)(\\${openDelimiter}|\\${closeDelimiter})`, "g");
	let matchEnd: number | undefined = undefined;
	let delimiterCount = 0;
	let extract: string | undefined = undefined;

	let m: RegExpExecArray | null;

	while (m = match.exec(section)) {
		if (m[0] == openDelimiter) {
			delimiterCount++;
		}
		else if (m[0] == closeDelimiter) {
			if (delimiterCount)
				delimiterCount--;
			else {
				matchEnd = m.index;
				break;
			}
		}
	}

	if (matchEnd !== undefined)
		extract = section.slice(0, matchEnd);
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
