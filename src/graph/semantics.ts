import { parseFz, fzParent } from "./folgezettel";

export type Dir = "out" | "in" | "mutual";
export interface Reference {
	id: string;
	dir: Dir;
	/** True if the link target doesn't resolve to a file in the vault. */
	ghost?: boolean;
	/** Original wikilink target text — set for ghosts so we can preserve the title. */
	targetText?: string;
}

/**
 * Is otherId an ancestor, descendant, sibling, or self of currentId?
 * Used to keep halo and spine strictly disjoint.
 */
export function isFolgezettelRelative(
	currentId: string,
	otherId: string,
): boolean {
	if (currentId === otherId) return true;

	const cur = parseFz(currentId);
	const oth = parseFz(otherId);
	if (cur.length === 0 || oth.length === 0) return false;

	// Ancestor or descendant: one's segments are a prefix of the other's
	const minLen = Math.min(cur.length, oth.length);
	let isPrefix = true;
	for (let i = 0; i < minLen; i++) {
		if (cur[i] !== oth[i]) {
			isPrefix = false;
			break;
		}
	}
	if (isPrefix) return true;

	// Sibling: same direct parent
	const cp = fzParent(currentId);
	const op = fzParent(otherId);
	return cp !== null && cp === op;
}
