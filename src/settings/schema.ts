export type OpenCanvasOn = "active-file" | "last-viewed" | "empty-splash";

export interface StumblespaceSettings {
	showIncomingAndMutual: boolean;
	animationDurationMs: number;
	openCanvasOn: OpenCanvasOn;
	openCenteredNoteInEditor: boolean;
	lastViewedId: string | null;
}

export const DEFAULT_SETTINGS: StumblespaceSettings = {
	showIncomingAndMutual: true,
	animationDurationMs: 500,
	openCanvasOn: "active-file",
	openCenteredNoteInEditor: false,
	lastViewedId: null,
};
