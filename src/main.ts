import { Plugin } from "obsidian";
import { StumblespaceView, VIEW_TYPE } from "./view";
import { VaultIndex } from "./graph/index";

export default class StumblespacePlugin extends Plugin {
	index!: VaultIndex;
	private rebuildTimer: number | null = null;

	async onload(): Promise<void> {
		this.index = new VaultIndex(this.app);

		this.registerView(VIEW_TYPE, (leaf) => new StumblespaceView(leaf));

		this.addCommand({
			id: "open-canvas",
			name: "Open spatial canvas",
			callback: () => this.activateView(),
		});

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

	async activateView(): Promise<void> {
		const { workspace } = this.app;

		let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
		if (!leaf) {
			const newLeaf = workspace.getRightLeaf(false);
			if (!newLeaf) return;
			await newLeaf.setViewState({ type: VIEW_TYPE, active: true });
			leaf = newLeaf;
		}

		workspace.revealLeaf(leaf);
	}
}
