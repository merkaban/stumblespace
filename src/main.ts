import { Plugin } from "obsidian";
import { StumblespaceView, VIEW_TYPE } from "./view";
import { VaultIndex } from "./graph/index";
import { DEFAULT_SETTINGS, type StumblespaceSettings } from "./settings/schema";
import { StumblespaceSettingTab } from "./settings/tab";

export default class StumblespacePlugin extends Plugin {
	index!: VaultIndex;
	settings!: StumblespaceSettings;
	private rebuildTimer: number | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.index = new VaultIndex(this.app);

		this.registerView(VIEW_TYPE, (leaf) => new StumblespaceView(leaf, this));

		this.addCommand({
			id: "open-canvas",
			name: "Open spatial canvas",
			callback: () => this.activateView(),
		});

		this.addSettingTab(new StumblespaceSettingTab(this.app, this));

		// Vault subscriptions — debounced rebuild + notify open views
		const scheduleRebuild = () => {
			if (this.rebuildTimer !== null) window.clearTimeout(this.rebuildTimer);
			this.rebuildTimer = window.setTimeout(() => {
				this.index.rebuild();
				this.rebuildTimer = null;
				for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
					const v = leaf.view;
					if (v instanceof StumblespaceView) v.queueRender();
				}
			}, 250);
		};

		this.registerEvent(
			this.app.metadataCache.on("resolved", scheduleRebuild),
		);
		this.registerEvent(this.app.vault.on("rename", scheduleRebuild));
		this.registerEvent(this.app.vault.on("delete", scheduleRebuild));
		this.registerEvent(this.app.vault.on("create", scheduleRebuild));
	}

	async loadSettings(): Promise<void> {
		const data = (await this.loadData()) as Partial<StumblespaceSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
	}

	async saveSettings(opts?: { skipNotify?: boolean }): Promise<void> {
		await this.saveData(this.settings);
		if (opts?.skipNotify) return;
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
			const v = leaf.view;
			if (v instanceof StumblespaceView) v.applySettings();
		}
	}

	async activateView(): Promise<void> {
		const { workspace } = this.app;

		let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
		if (!leaf) {
			const newLeaf = workspace.getRightLeaf(false);
			if (!newLeaf) return;
			await newLeaf.setViewState({ type: VIEW_TYPE, active: true });
			leaf = newLeaf;
		}

		await workspace.revealLeaf(leaf);
		if (leaf.view instanceof StumblespaceView) {
			leaf.view.contentEl.focus({ preventScroll: true });
		}
	}
}
