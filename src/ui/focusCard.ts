import { Component, Keymap, MarkdownRenderer, Notice, TFile } from "obsidian";
import { parseIdFromFilename, parseIdFromLinkText } from "../graph/folgezettel";
import type { StumblespaceView } from "../view";

const SOURCE_RE = /^\[\[(.+?)]]$/;

/** Extract link text from a frontmatter source entry — accepts string or {link} object. */
function extractSourceText(entry: unknown): string | null {
	if (typeof entry === "string") {
		const m = entry.match(SOURCE_RE);
		return m ? m[1]! : entry;
	}
	if (entry && typeof entry === "object") {
		const obj = entry as Record<string, unknown>;
		for (const k of ["link", "path", "id", "original"]) {
			const v = obj[k];
			if (typeof v === "string") {
				const m = v.match(SOURCE_RE);
				return m ? m[1]! : v;
			}
		}
	}
	return null;
}

export class FocusCard extends Component {
	private view: StumblespaceView;
	private id: string;
	private scrim: HTMLElement | null = null;
	private card: HTMLElement | null = null;

	constructor(view: StumblespaceView, id: string) {
		super();
		this.view = view;
		this.id = id;
	}

	async open(): Promise<void> {
		const file = this.view.getIndex().getNote(this.id);
		if (!file) {
			new Notice("File not found");
			return;
		}

		const root = this.view.contentEl;
		this.scrim = root.createDiv({ cls: "ss-scrim" });
		this.card = root.createDiv({ cls: "ss-focuscard" });

		// Header
		const header = this.card.createDiv({ cls: "ss-fc-header" });
		header.createDiv({ cls: "ss-fc-id", text: this.id });
		const title = file.basename.replace(/^\S+\s/, "");
		header.createDiv({ cls: "ss-fc-title", text: title });
		const closeBtn = header.createEl("button", {
			cls: "ss-fc-close",
			text: "×",
			attr: { "aria-label": "Close focus card" },
		});

		// Body
		const body = this.card.createDiv({ cls: "ss-fc-body" });
		try {
			const content = await this.view.app.vault.cachedRead(file);
			await MarkdownRenderer.render(this.view.app, content, body, file.path, this);
		} catch (err) {
			new Notice(`Render failed: ${String(err)}`);
		}

		// Sources
		this.renderSources(file);

		// Listeners (Component-scoped — auto-cleanup on unload)
		this.registerDomEvent(this.scrim, "click", () => this.view.closeFocusCard());
		this.registerDomEvent(closeBtn, "click", () => this.view.closeFocusCard());
		this.registerDomEvent(body, "click", (e: MouseEvent) => this.handleBodyClick(e, file));
	}

	onunload(): void {
		this.scrim?.remove();
		this.card?.remove();
		this.scrim = null;
		this.card = null;
	}

	private renderSources(file: TFile): void {
		if (!this.card) return;
		const fm = this.view.app.metadataCache.getFileCache(file)?.frontmatter;
		const sources: unknown[] = Array.isArray(fm?.sources) ? fm.sources : [];
		if (sources.length === 0) return;

		const wrap = this.card.createDiv({ cls: "ss-fc-sources" });
		wrap.createEl("h4", { text: "Sources" });
		const list = wrap.createEl("ul");

		for (const entry of sources) {
			// Obsidian may parse wikilinks in frontmatter as strings or as objects.
			// Pull the link text out of either shape.
			const linkText = extractSourceText(entry);
			if (!linkText) continue;
			const sourceId = parseIdFromFilename(linkText) ?? parseIdFromLinkText(linkText);
			const item = list.createEl("li");
			if (!sourceId || !this.view.getIndex().getNote(sourceId)) {
				item.createSpan({ cls: "ss-fc-source ss-fc-source-missing", text: linkText });
				continue;
			}
			const btn = item.createEl("button", { cls: "ss-fc-source", text: linkText });
			this.registerDomEvent(btn, "click", () => {
				this.view.closeFocusCard();
				this.view.recenter(sourceId);
			});
		}
	}

	private handleBodyClick(e: MouseEvent, file: TFile): void {
		const target = e.target;
		if (!(target instanceof HTMLElement)) return;
		const a = target.closest("a.internal-link");
		if (!a) return;

		const href = a.getAttribute("data-href") ?? a.getAttribute("href") ?? "";
		if (!href) return;

		// Always preventDefault — MarkdownRenderer doesn't auto-wire link clicks
		// in our context, so we route every internal-link click ourselves.
		e.preventDefault();

		// Mod+click → open in new tab; card stays put.
		if (Keymap.isModEvent(e)) {
			void this.view.app.workspace.openLinkText(href, file.path, true);
			return;
		}

		// Plain click: close + recenter if target is a Zettel; otherwise open inline.
		const dest = this.view.app.metadataCache.getFirstLinkpathDest(href, file.path);
		let targetId: string | null = null;
		if (dest instanceof TFile) targetId = parseIdFromFilename(dest.basename);
		if (!targetId) targetId = parseIdFromLinkText(href);

		if (targetId && this.view.getIndex().getNote(targetId)) {
			this.view.closeFocusCard();
			this.view.recenter(targetId);
		} else {
			void this.view.app.workspace.openLinkText(href, file.path, false);
		}
	}
}
