import { ItemView, Keymap, Notice, WorkspaceLeaf, normalizePath, type ViewStateResult } from "obsidian";
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

	constructor(leaf: WorkspaceLeaf, plugin: StumblespacePlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string { return VIEW_TYPE; }
	getDisplayText(): string { return "Stumblespace"; }
	getIcon(): string { return "network"; }

	getState(): Record<string, unknown> {
		return { currentId: this.state.currentId };
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		if (state && typeof state === "object" && "currentId" in state) {
			const id = (state as Record<string, unknown>).currentId;
			if (typeof id === "string") {
				this.state.currentId = id;
				this.state.kbFocus = id;
			}
		}
		await super.setState(state, result);
		this.queueRender();
	}

	getIndex(): VaultIndex { return this.plugin.index; }

	async onOpen(): Promise<void> {
		const container = this.contentEl;
		container.empty();
		container.addClass("stumblespace-root");
		container.setAttribute("tabindex", "0");

		// Canvas
		this.canvasEl = container.createDiv({ cls: "ss-canvas" });
		this.canvasEl.setAttribute("role", "application");
		this.canvasEl.setAttribute("aria-roledescription", "Spatial folgezettel canvas");
		this.canvasEl.createDiv({ cls: "ss-grain" });
		const svg = this.canvasEl.createSvg("svg", { cls: "ss-edges" });

		// Back button
		const backBtn = this.canvasEl.createEl("button", { cls: "ss-backbtn ss-hidden", text: "\u2190 back" });
		this.registerDomEvent(backBtn, "click", () => this.goBack());

		// Renderer + keyboard
		this.renderer = new CanvasRenderer(this, this.canvasEl, svg);
		attachKeyboardHandler(this, container);

		this.applySettings();

		// Follow active file only when the user opted into "active-file" mode.
		// In "last-viewed" / "empty-splash" modes the canvas stays put on its
		// initial state and doesn't react to leaf changes.
		const onActiveChange = () => {
			if (this.plugin.settings.openCanvasOn === "active-file") {
				this.syncToActiveFile();
			}
		};
		this.registerEvent(this.app.workspace.on("active-leaf-change", onActiveChange));
		this.registerEvent(this.app.workspace.on("file-open", onActiveChange));

		// Re-render on metadata updates. resolved fires after bulk resolution;
		// changed fires per-file on edit — both route through RAF-throttled queueRender.
		this.registerEvent(
			this.app.metadataCache.on("resolved", () => this.queueRender()),
		);
		this.registerEvent(
			this.app.metadataCache.on("changed", () => this.queueRender()),
		);

		// Resize — ResizeObserver catches both window resize and pane drag.
		// Full re-layout (not just edges) because sib/child gaps depend on
		// canvas width, so we need to recompute positions on resize.
		const ro = new ResizeObserver(() => this.queueRender());
		ro.observe(this.canvasEl);
		this.register(() => ro.disconnect());

		this.applyOpenCanvasOn();
	}

	private applyOpenCanvasOn(): void {
		const mode = this.plugin.settings.openCanvasOn;
		if (mode === "active-file") this.syncToActiveFile();
		else if (mode === "last-viewed") this.restoreLastViewed();
		else this.showSplash("no-active");
	}

	private restoreLastViewed(): void {
		const id = this.plugin.settings.lastViewedId;
		const file = id ? this.plugin.index.getNote(id) : undefined;
		if (id && file) {
			this.state.currentId = id;
			this.state.kbFocus = id;
			this.queueRender();
		} else {
			this.syncToActiveFile();
		}
	}

	applySettings(): void {
		const ms = this.plugin.settings.animationDurationMs;
		this.contentEl.style.setProperty("--ss-anim-duration", `${ms}ms`);
		this.queueRender();
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
			this.showSplash("no-id");
			return;
		}
		if (id !== this.state.currentId) {
			this.state.currentId = id;
			this.state.kbFocus = id;
			this.persistLastViewed(id);
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
			settings: this.plugin.settings,
			canvasWidthPx: this.canvasEl.clientWidth,
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
		if (pos?.moreCount) {
			// Synthetic "+N more" indicator — recenter on the kid so the
			// hidden grandchildren become visible as direct children.
			const kidId = id.replace(/__more$/, "");
			this.recenter(kidId);
			return;
		}
		if (pos?.ghost) {
			void this.handleGhostClick(id);
			return;
		}
		if (Keymap.isModEvent(e)) {
			// Mod+click → open in new tab
			const file = this.plugin.index.getNote(id);
			if (file) void this.app.workspace.openLinkText(file.path, "", true);
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
			void this.handleGhostClick(id);
			return;
		}
		const file = this.plugin.index.getNote(id);
		if (file) void this.app.workspace.openLinkText(file.path, "", true);
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
			new Notice(`Create failed: ${String(err)}`);
		}
	}

	recenter(id: string): void {
		if (this.state.currentId) {
			this.state.history.push(this.state.currentId);
			if (this.state.history.length > 64) this.state.history.shift();
		}
		this.state.currentId = id;
		this.state.kbFocus = id;
		this.persistLastViewed(id);
		this.queueRender();
		this.mirrorCenterToEditor(id);
	}

	goBack(): void {
		const prev = this.state.history.pop();
		if (!prev) return;
		this.state.currentId = prev;
		this.state.kbFocus = prev;
		this.persistLastViewed(prev);
		this.queueRender();
		this.mirrorCenterToEditor(prev);
	}

	private mirrorCenterToEditor(id: string): void {
		if (!this.plugin.settings.openCenteredNoteInEditor) return;
		const file = this.plugin.index.getNote(id);
		if (!file) return;
		void this.app.workspace.openLinkText(file.path, "", false).then(() => {
			this.contentEl.focus({ preventScroll: true });
		});
	}

	private persistLastViewed(id: string): void {
		if (this.plugin.settings.lastViewedId === id) return;
		this.plugin.settings.lastViewedId = id;
		void this.plugin.saveSettings({ skipNotify: true });
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

	openFocusCard(id?: string): void {
		if (this.activeFocusCard) return;
		const target = id ?? this.state.kbFocus ?? this.state.currentId;
		if (!target) return;
		const card = new FocusCard(this, target);
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
	private showSplash(mode: SplashMode): void {
		if (!this.canvasEl) return;
		this.hideSplash();
		this.splashEl = renderSplash(this, this.canvasEl, mode);
	}

	private hideSplash(): void {
		if (this.splashEl) {
			this.splashEl.remove();
			this.splashEl = null;
		}
	}
}
