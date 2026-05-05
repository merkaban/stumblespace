import { Modal, Notice, TFile, normalizePath } from "obsidian";
import { parseFz } from "../graph/folgezettel";
import type { StumblespaceView } from "../view";

export type SplashMode = "no-active" | "no-id";

export function renderSplash(
	view: StumblespaceView,
	container: HTMLElement,
	mode: SplashMode,
	file?: TFile,
): HTMLElement {
	const el = container.createDiv({ cls: "ss-splash" });

	if (mode === "no-active") {
		el.createEl("h3", { text: "No Zettel selected" });
		el.createEl("p", { text: "Open a note with a Folgezettel filename prefix, or pick a root below." });

		const roots = collectRoots(view);
		if (roots.length > 0) {
			const list = el.createEl("ul", { cls: "ss-splash-list" });
			for (const id of roots) {
				const file = view.getIndex().getNote(id);
				if (!file) continue;
				const item = list.createEl("li");
				const btn = item.createEl("button", {
					cls: "ss-splash-item",
					text: `${id} ${file.basename.replace(/^\S+\s/, "")}`,
				});
				view.registerDomEvent(btn, "click", () => view.recenter(id));
			}
		}
	} else {
		el.createEl("h3", { text: "Active file is not a Zettel" });
		el.createEl("p", { text: "Filename needs a Folgezettel prefix like “1.1a Title.md”." });
		if (file) {
			const btn = el.createEl("button", {
				cls: "ss-splash-action",
				text: "Add Folgezettel ID",
			});
			view.registerDomEvent(btn, "click", () => {
				new AddIdModal(view, file).open();
			});
		}
	}

	return el;
}

function collectRoots(view: StumblespaceView): string[] {
	const out: string[] = [];
	for (const id of view.getIndex().byId.keys()) {
		if (parseFz(id).length === 1) out.push(id);
	}
	out.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
	return out;
}

class AddIdModal extends Modal {
	private view: StumblespaceView;
	private file: TFile;
	private idInput!: HTMLInputElement;

	constructor(view: StumblespaceView, file: TFile) {
		super(view.app);
		this.view = view;
		this.file = file;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", { text: "Add Folgezettel ID" });
		contentEl.createEl("p", {
			text: `Rename "${this.file.basename}" with a Folgezettel prefix.`,
		});

		this.idInput = contentEl.createEl("input", {
			type: "text",
			cls: "ss-modal-input",
			attr: { placeholder: "e.g. 1.1a3" },
		});
		this.idInput.focus();

		const btnRow = contentEl.createDiv({ cls: "ss-modal-buttons" });
		const cancel = btnRow.createEl("button", { text: "Cancel" });
		const save = btnRow.createEl("button", { text: "Rename", cls: "mod-cta" });

		cancel.addEventListener("click", () => this.close());
		save.addEventListener("click", () => this.submit());
		this.idInput.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter") this.submit();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async submit(): Promise<void> {
		const id = this.idInput.value.trim();
		if (!id || parseFz(id).length === 0) {
			new Notice("Invalid Folgezettel ID");
			return;
		}
		const folder = this.file.parent?.path ?? "";
		const newPath = normalizePath(
			(folder ? folder + "/" : "") + `${id} ${this.file.basename}.md`,
		);
		try {
			await this.app.fileManager.renameFile(this.file, newPath);
			this.close();
		} catch (err) {
			new Notice(`Rename failed: ${err}`);
		}
	}
}
