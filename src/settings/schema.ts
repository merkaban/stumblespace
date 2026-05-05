export type OpenCanvasOn = "active-file" | "last-viewed" | "empty-splash";

export interface StumblespaceSettings {
	showIncomingAndMutual: boolean;
	animationDurationMs: number;
	openCanvasOn: OpenCanvasOn;
	lastViewedId: string | null;
}

export const DEFAULT_SETTINGS: StumblespaceSettings = {
	showIncomingAndMutual: true,
	animationDurationMs: 500,
	openCanvasOn: "active-file",
	lastViewedId: null,
};
