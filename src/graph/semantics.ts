import { parseFz, fzParent } from "./folgezettel";
import type { StumblespaceSettings } from "../settings/schema";

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

/**
 * Apply the "show incoming + mutual" toggle.
 * When OFF: drop incoming-only refs, demote mutuals to plain outgoing.
 * When ON: identity.
 */
export function effectiveSemantics(
	refs: Reference[],
	settings: StumblespaceSettings,
): Reference[] {
	if (settings.showIncomingAndMutual) return refs;
	const out: Reference[] = [];
	for (const r of refs) {
		if (r.dir === "in") continue;
		if (r.dir === "mutual") out.push({ ...r, dir: "out" });
		else out.push(r);
	}
	return out;
}
