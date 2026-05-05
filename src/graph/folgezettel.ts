const ID_FILENAME_RE = /^(\d+\.\d+(?:[a-z]+\d+)*[a-z]?)\s/;
const ID_LINK_RE = /^(\d+\.\d+(?:[a-z]+\d+)*[a-z]?)(?:\s|$)/;

/** Parse the ID prefix from a file basename. Requires "<id> <title>" form. */
export function parseIdFromFilename(basename: string): string | null {
	const m = basename.match(ID_FILENAME_RE);
	return m ? m[1]! : null;
}

/** Lenient: accept either "<id>" alone or "<id> <title>" — used for wikilink targets. */
export function parseIdFromLinkText(text: string): string | null {
	const m = text.match(ID_LINK_RE);
	return m ? m[1]! : null;
}

/**
 * Parse a Folgezettel ID into segments.
 * Format: "N." prefix + alternating number/letter groups.
 * E.g. "1.1a3b" → ["1", "1", "a", "3", "b"]
 */
export function parseFz(id: string): string[] {
	const dot = id.indexOf(".");
	if (dot === -1) return [];

	const root = id.slice(0, dot);
	const rest = id.slice(dot + 1);
	if (!rest) return [root];

	const segments = [root];
	let buf = "";
	let mode: "d" | "a" | null = null;

	for (const ch of rest) {
		const isDigit = /\d/.test(ch);
		const m = isDigit ? "d" : "a";
		if (mode === null) {
			mode = m;
			buf = ch;
		} else if (m === mode) {
			buf += ch;
		} else {
			segments.push(buf);
			buf = ch;
			mode = m;
		}
	}
	if (buf) segments.push(buf);

	return segments;
}

/** Reconstruct an ID string from parsed segments. */
function joinFz(segments: string[]): string {
	if (segments.length === 0) return "";
	return segments[0] + "." + segments.slice(1).join("");
}

/** Get the parent ID, or null if this is a root. */
export function fzParent(id: string): string | null {
	const p = parseFz(id);
	if (p.length <= 2) return null; // root like "1.1" has no parent
	return joinFz(p.slice(0, -1));
}

/** Walk up the tree, returning nearest-first ancestors that exist in allIds. */
export function fzAncestors(id: string, allIds: Set<string>): string[] {
	const out: string[] = [];
	let cur = id;
	while (true) {
		const p = fzParent(cur);
		if (!p || !allIds.has(p)) break;
		out.push(p);
		cur = p;
	}
	return out;
}

/** Find direct children: IDs one segment deeper with matching prefix. */
export function fzChildren(id: string, allIds: Set<string>): string[] {
	const depth = parseFz(id).length;
	const out: string[] = [];
	for (const other of allIds) {
		const op = parseFz(other);
		if (op.length !== depth + 1) continue;
		if (fzParent(other) === id) out.push(other);
	}
	return out.sort();
}

/** Find siblings: same parent, excluding self. */
export function fzSiblings(id: string, allIds: Set<string>): string[] {
	const p = fzParent(id);
	if (!p) return [];
	return fzChildren(p, allIds).filter((k) => k !== id);
}
