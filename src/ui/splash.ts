import { parseFz } from "../graph/folgezettel";
import type { StumblespaceView } from "../view";

export type SplashMode = "no-active" | "no-id";

export function renderSplash(
	view: StumblespaceView,
	container: HTMLElement,
	mode: SplashMode,
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
		el.createEl("p", { text: "Rename the file with a Folgezettel prefix like “1.1a Title.md”." });
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
