import { Plugin } from "obsidian";
import { StumblespaceView, VIEW_TYPE } from "./view";

export default class StumblespacePlugin extends Plugin {
	async onload(): Promise<void> {
		this.registerView(VIEW_TYPE, (leaf) => new StumblespaceView(leaf));

		this.addCommand({
			id: "open-canvas",
			name: "Open spatial canvas",
			callback: () => this.activateView(),
		});
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
