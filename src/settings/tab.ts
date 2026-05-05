import { App, PluginSettingTab, Setting } from "obsidian";
import type StumblespacePlugin from "../main";
import type { OpenCanvasOn } from "./schema";

export class StumblespaceSettingTab extends PluginSettingTab {
	private plugin: StumblespacePlugin;

	constructor(app: App, plugin: StumblespacePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		const s = this.plugin.settings;
		const save = () => this.plugin.saveSettings();

		new Setting(containerEl)
			.setName("Show incoming + mutual references")
			.setDesc("When off, only outgoing references appear on the halo.")
			.addToggle((t) =>
				t.setValue(s.showIncomingAndMutual).onChange(async (v) => {
					s.showIncomingAndMutual = v;
					await save();
				}),
			);

		new Setting(containerEl)
			.setName("Animation duration (ms)")
			.setDesc("Transition time when recentering. Overridden by system reduce-motion.")
			.addText((t) =>
				t.setValue(String(s.animationDurationMs)).onChange(async (v) => {
					const n = parseInt(v, 10);
					if (!Number.isFinite(n) || n < 0) return;
					s.animationDurationMs = n;
					await save();
				}),
			);

		new Setting(containerEl)
			.setName("Open canvas on")
			.setDesc("Which Zettel the canvas centers on when opened.")
			.addDropdown((d) =>
				d
					.addOption("active-file", "Active file")
					.addOption("last-viewed", "Last viewed Zettel")
					.addOption("empty-splash", "Empty splash")
					.setValue(s.openCanvasOn)
					.onChange(async (v) => {
						s.openCanvasOn = v as OpenCanvasOn;
						await save();
					}),
			);
	}
}
