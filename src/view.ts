import { ItemView, Keymap, Notice, TFile, WorkspaceLeaf, normalizePath } from "obsidian";
import { layout, type PositionMap } from "./layout";
import { CanvasRenderer } from "./render";
import { attachKeyboardHandler } from "./ui/keyboard";
import { renderSplash, type SplashMode } from "./ui/splash";
import { FocusCard } from "./ui/focusCard";
import { parseIdFromFilename, VaultIndex } from "./graph/index";
import type StumblespacePlugin from "./main";

export const VIEW_TYPE = "stumblespace";

export interface ViewState {
	currentId: string | null;
	history: string[];
	kbFocus: string | null;
	lastPositions: PositionMap;
}

export class StumblespaceView extends ItemView {
	plugin: StumblespacePlugin;
	state: ViewState = {
		currentId: null,
		history: [],
		kbFocus: null,
		lastPositions: new Map(),
	};

	private renderer: CanvasRenderer | null = null;
	private canvasEl: HTMLElement | null = null;
	private splashEl: HTMLElement | null = null;
	private activeFocusCard: FocusCard | null = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
		this.plugin = (this.app as any).plugins.plugins["stumblespace"] as StumblespacePlugin;
	}

	getViewType(): string { return VIEW_TYPE; }
	getDisplayText(): string { return "Stumblespace"; }
	getIcon(): string { return "network"; }

	getIndex(): VaultIndex { return this.plugin.index; }

	async onOpen(): Promise<void> {
		const container = this.contentEl;
		container.empty();
		container.addClass("stumblespace-root");
		container.setAttribute("tabindex", "0");

		// Canvas
		this.canvasEl = container.createDiv({ cls: "ss-canvas" });
		this.canvasEl.createDiv({ cls: "ss-grain" });
		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		svg.classList.add("ss-edges");
		this.canvasEl.appendChild(svg);

		// Back button
		const backBtn = this.canvasEl.createEl("button", { cls: "ss-backbtn ss-hidden", text: "\u2190 back" });
		this.registerDomEvent(backBtn, "click", () => this.goBack());

		// Renderer + keyboard
		this.renderer = new CanvasRenderer(this, this.canvasEl, svg);
		attachKeyboardHandler(this, container);

		// Follow active file. file-open fires when the file in a leaf changes
		// (covers re-clicking the same leaf with a different file in file-nav).
		// active-leaf-change covers switching between leaves.
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => this.syncToActiveFile()),
		);
		this.registerEvent(
			this.app.workspace.on("file-open", () => this.syncToActiveFile()),
		);

		// Re-render on metadata updates. resolved fires after bulk resolution;
		// changed fires per-file on edit — both route through RAF-throttled queueRender.
		this.registerEvent(
			this.app.metadataCache.on("resolved", () => this.queueRender()),
		);
		this.registerEvent(
			this.app.metadataCache.on("changed", () => this.queueRender()),
		);

		// Resize — ResizeObserver catches both window resize and pane drag
		const ro = new ResizeObserver(() => {
			requestAnimationFrame(() => this.renderer?.redrawEdges());
		});
		ro.observe(this.canvasEl);
		this.register(() => ro.disconnect());

		this.syncToActiveFile();
	}

	async onClose(): Promise<void> {
		this.renderer?.destroy();
		this.renderer = null;
		this.contentEl.empty();
	}

	private syncToActiveFile(): void {
		const file = this.app.workspace.getActiveFile();
		if (!file) {
			this.state.currentId = null;
			this.state.kbFocus = null;
			this.showSplash("no-active");
			return;
		}
		const id = parseIdFromFilename(file.basename);
		if (!id) {
			this.state.currentId = null;
			this.state.kbFocus = null;
			this.showSplash("no-id", file);
			return;
		}
		if (id !== this.state.currentId) {
			this.state.currentId = id;
			this.state.kbFocus = id;
			this.queueRender();
		}
	}

	queueRender(): void {
		requestAnimationFrame(() => this.doRender());
	}

	private doRender(): void {
		if (!this.state.currentId || !this.renderer || !this.canvasEl) return;

		this.hideSplash();
		const index = this.plugin.index;
		const id = this.state.currentId;

		const children = index.getChildren(id);
		const grandchildrenByKid = new Map<string, string[]>();
		for (const kid of children) {
			grandchildrenByKid.set(kid, index.getChildren(kid));
		}

		const positions = layout({
			currentId: id,
			ancestors: index.getAncestors(id),
			siblings: index.getSiblings(id),
			children,
			grandchildrenByKid,
			references: index.getReferences(id),
		});

		this.state.lastPositions = positions;
		if (!this.state.kbFocus || !positions.has(this.state.kbFocus)) {
			this.state.kbFocus = id;
		}

		this.renderer.render(positions);

		// Update back button
		const backBtn = this.canvasEl.querySelector(".ss-backbtn");
		if (backBtn) backBtn.classList.toggle("ss-hidden", this.state.history.length === 0);
	}

	// --- Public actions (called by renderer and keyboard) ---

	handleNodeClick(id: string, e: MouseEvent): void {
		const pos = this.state.lastPositions.get(id);
		if (pos?.ghost) {
			this.handleGhostClick(id);
			return;
		}
		if (Keymap.isModEvent(e)) {
			// Mod+click → open in new tab
			const file = this.plugin.index.getNote(id);
			if (file) this.app.workspace.openLinkText(file.path, "", true);
			return;
		}
		if (id === this.state.currentId) {
			this.state.kbFocus = id;
			return;
		}
		this.recenter(id);
	}

	handleNodeMiddleClick(id: string): void {
		const pos = this.state.lastPositions.get(id);
		if (pos?.ghost) {
			this.handleGhostClick(id);
			return;
		}
		const file = this.plugin.index.getNote(id);
		if (file) this.app.workspace.openLinkText(file.path, "", true);
	}

	private async handleGhostClick(ghostId: string): Promise<void> {
		const pos = this.state.lastPositions.get(ghostId);
		const target = pos?.targetText ?? ghostId;
		// targetText is the wikilink as typed: "<id>" or "<id> <title>".
		// If just an ID, append a space so the regex still parses it as a Zettel.
		const basename = target.includes(" ") ? target : `${target} `;

		const currentFile = this.state.currentId
			? this.plugin.index.getNote(this.state.currentId)
			: null;
		const folderPath = currentFile?.parent?.path ?? "";
		const path = normalizePath(
			(folderPath ? folderPath + "/" : "") + `${basename}.md`,
		);
		try {
			await this.app.vault.create(path, "");
			this.recenter(ghostId);
		} catch (err) {
			new Notice(`Create failed: ${err}`);
		}
	}

	recenter(id: string): void {
		if (this.state.currentId) {
			this.state.history.push(this.state.currentId);
			if (this.state.history.length > 64) this.state.history.shift();
		}
		this.state.currentId = id;
		this.state.kbFocus = id;
		this.queueRender();
	}

	goBack(): void {
		const prev = this.state.history.pop();
		if (!prev) return;
		this.state.currentId = prev;
		this.state.kbFocus = prev;
		this.queueRender();
	}

	recenterOnKbFocus(): void {
		if (!this.state.kbFocus || this.state.kbFocus === this.state.currentId) return;
		this.recenter(this.state.kbFocus);
	}

	setKbFocus(id: string | null): void {
		if (!id || !this.state.lastPositions.has(id)) return;
		this.state.kbFocus = id;
		// Update focus ring on all nodes
		if (!this.canvasEl) return;
		this.canvasEl.querySelectorAll(".ss-node").forEach((el) => {
			const nodeId = el.querySelector(".ss-id")?.textContent;
			el.classList.toggle("ss-kb-focus", nodeId === id);
		});
	}

	openFocusCard(): void {
		if (this.activeFocusCard || !this.state.currentId) return;
		const card = new FocusCard(this, this.state.currentId);
		this.activeFocusCard = card;
		this.addChild(card);
		void card.open();
	}

	closeFocusCard(): void {
		if (!this.activeFocusCard) return;
		const card = this.activeFocusCard;
		this.activeFocusCard = null;
		this.removeChild(card);
		// Restore focus to the view container so keyboard nav keeps receiving keys.
		this.contentEl.focus({ preventScroll: true });
	}

	// Splash
	private showSplash(mode: SplashMode, file?: TFile): void {
		if (!this.canvasEl) return;
		this.hideSplash();
		this.splashEl = renderSplash(this, this.canvasEl, mode, file);
	}

	private hideSplash(): void {
		if (this.splashEl) {
			this.splashEl.remove();
			this.splashEl = null;
		}
	}
}
