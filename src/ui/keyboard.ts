import type { PositionMap } from "../layout";
import type { StumblespaceView } from "../view";

export function nearestInDirection(
	dirX: number,
	dirY: number,
	positions: PositionMap,
	kbFocus: string | null,
): string | null {
	if (!kbFocus) return null;
	const src = positions.get(kbFocus);
	if (!src) return null;

	let best: string | null = null;
	let bestScore = Infinity;

	for (const [id, p] of positions) {
		if (id === kbFocus) continue;
		const dx = p.x - src.x;
		const dy = p.y - src.y;
		if (dirX !== 0 && Math.sign(dx) !== dirX) continue;
		if (dirY !== 0 && Math.sign(dy) !== dirY) continue;
		const primary = Math.abs(dirX !== 0 ? dx : dy);
		const ortho = Math.abs(dirX !== 0 ? dy : dx);
		if (primary < ortho * 0.7) continue;
		const score = primary + ortho * 2.2;
		if (score < bestScore) {
			bestScore = score;
			best = id;
		}
	}
	return best;
}

export function attachKeyboardHandler(view: StumblespaceView, container: HTMLElement): void {
	view.registerDomEvent(container, "keydown", (e: KeyboardEvent) => {
		const tag = (e.target as HTMLElement)?.tagName ?? "";
		if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;

		if (e.key === "Escape") {
			view.closeFocusCard();
			return;
		}
		// Block nav keys while focus card is open
		if (container.querySelector(".ss-focuscard")) return;

		let handled = true;
		switch (e.key) {
			case "ArrowUp": view.setKbFocus(nearestInDirection(0, -1, view.state.lastPositions, view.state.kbFocus)); break;
			case "ArrowDown": view.setKbFocus(nearestInDirection(0, 1, view.state.lastPositions, view.state.kbFocus)); break;
			case "ArrowLeft": view.setKbFocus(nearestInDirection(-1, 0, view.state.lastPositions, view.state.kbFocus)); break;
			case "ArrowRight": view.setKbFocus(nearestInDirection(1, 0, view.state.lastPositions, view.state.kbFocus)); break;
			case "Enter": view.recenterOnKbFocus(); break;
			case "Backspace": view.goBack(); break;
			case "f": case "F": view.openFocusCard(); break;
			default: handled = false;
		}
		if (handled) e.preventDefault();
	});
}
