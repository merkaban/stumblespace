import { App, TFile } from "obsidian";
import {
	fzAncestors,
	fzChildren,
	fzSiblings,
	parseIdFromFilename,
	parseIdFromLinkText,
} from "./folgezettel";
import { isFolgezettelRelative, type Dir, type Reference } from "./semantics";

export { parseIdFromFilename, parseIdFromLinkText };

export class VaultIndex {
	byId = new Map<string, TFile>();
	private allIds = new Set<string>();
	private app: App;

	constructor(app: App) {
		this.app = app;
		this.rebuild();
	}

	rebuild(): void {
		this.byId.clear();
		this.allIds.clear();
		for (const file of this.app.vault.getMarkdownFiles()) {
			const id = parseIdFromFilename(file.basename);
			if (id) {
				this.byId.set(id, file);
				this.allIds.add(id);
			}
		}
	}

	getNote(id: string): TFile | undefined {
		return this.byId.get(id);
	}

	getChildren(id: string): string[] {
		return fzChildren(id, this.allIds);
	}

	getAncestors(id: string): string[] {
		return fzAncestors(id, this.allIds);
	}

	getSiblings(id: string): string[] {
		return fzSiblings(id, this.allIds);
	}

	/** Get source IDs from frontmatter `sources:` field. */
	getSources(id: string): string[] {
		const file = this.byId.get(id);
		if (!file) return [];
		const cache = this.app.metadataCache.getFileCache(file);
		const fm: unknown = cache?.frontmatter;
		let sources: unknown[] = [];
		if (fm && typeof fm === "object" && "sources" in fm) {
			const raw = (fm as Record<string, unknown>).sources;
			if (Array.isArray(raw)) sources = raw;
		}
		const out: string[] = [];
		for (const entry of sources) {
			if (typeof entry !== "string") continue;
			// Extract basename from wikilink: "[[1.1a3 Title]]" → "1.1a3 Title"
			const match = entry.match(/^\[\[(.+?)]]$/);
			if (!match) continue;
			const linkedId = parseIdFromFilename(match[1]!);
			if (linkedId) out.push(linkedId);
		}
		return out;
	}

	/** Get semantic references with direction, excluding folgezettel relatives and sources. */
	getReferences(id: string): Reference[] {
		const file = this.byId.get(id);
		if (!file) return [];

		const sourceIds = new Set(this.getSources(id));
		const outgoing = new Set<string>();
		const incoming = new Set<string>();

		// Forward links from resolvedLinks
		const resolved = this.app.metadataCache.resolvedLinks[file.path];
		if (resolved) {
			for (const targetPath of Object.keys(resolved)) {
				const targetFile = this.app.vault.getAbstractFileByPath(targetPath);
				if (!(targetFile instanceof TFile)) continue;
				const targetId = parseIdFromFilename(targetFile.basename);
				if (targetId) outgoing.add(targetId);
			}
		}

		// Backlinks: scan all other files' resolved links for pointers to this file
		for (const [sourcePath, links] of Object.entries(
			this.app.metadataCache.resolvedLinks,
		)) {
			if (sourcePath === file.path) continue;
			if (!links[file.path]) continue;
			const sourceFile = this.app.vault.getAbstractFileByPath(sourcePath);
			if (!(sourceFile instanceof TFile)) continue;
			const sourceId = parseIdFromFilename(sourceFile.basename);
			if (sourceId) incoming.add(sourceId);
		}

		// Merge and filter
		const allLinked = new Set([...outgoing, ...incoming]);
		const refs: Reference[] = [];
		const seen = new Set<string>();
		for (const otherId of allLinked) {
			if (otherId === id) continue;
			if (isFolgezettelRelative(id, otherId)) continue;
			if (sourceIds.has(otherId)) continue;
			let dir: Dir;
			if (outgoing.has(otherId) && incoming.has(otherId)) dir = "mutual";
			else if (outgoing.has(otherId)) dir = "out";
			else dir = "in";
			refs.push({ id: otherId, dir });
			seen.add(otherId);
		}

		// Ghost references: unresolved wikilinks in current's body whose target text
		// parses as a Folgezettel ID. Accept bare "<id>" or "<id> <title>" forms.
		const unresolved = this.app.metadataCache.unresolvedLinks[file.path];
		if (unresolved) {
			for (const target of Object.keys(unresolved)) {
				const ghostId = parseIdFromLinkText(target);
				if (!ghostId) continue;
				if (this.byId.has(ghostId)) continue;
				if (ghostId === id) continue;
				if (isFolgezettelRelative(id, ghostId)) continue;
				if (sourceIds.has(ghostId)) continue;
				if (seen.has(ghostId)) continue;
				refs.push({ id: ghostId, dir: "out", ghost: true, targetText: target });
				seen.add(ghostId);
			}
		}
		return refs;
	}
}
