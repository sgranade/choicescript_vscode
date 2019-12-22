/**
 * Scan text to find a matching delimiter.
 * 
 * @param section Section of text to scan.
 * @param openDelimiter Delimiter that opens the group.
 * @param closeDelimiter Delimiter that closes the group.
 * @returns Index corresponding to one past the delimiter's end
 */
export function extractToMatchingDelimiter(section: string, openDelimiter: string, closeDelimiter: string): string | undefined {
	let match = RegExp(`\\${openDelimiter}|\\${closeDelimiter}`, "g");
	let matchEnd: number | undefined = undefined;
	let delimiterCount = 0;

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
		return section.slice(0, matchEnd);
	return undefined;
}
