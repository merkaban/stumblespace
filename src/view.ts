import { ItemView, WorkspaceLeaf } from "obsidian";

export const VIEW_TYPE = "stumblespace";

export class StumblespaceView extends ItemView {
	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Stumblespace";
	}

	getIcon(): string {
		return "network";
	}

	async onOpen(): Promise<void> {
		const container = this.contentEl;
		container.empty();
		container.createDiv({ cls: "stumblespace-placeholder", text: "Stumblespace canvas will render here." });
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}
}
