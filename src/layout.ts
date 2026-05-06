import { effectiveSemantics, type Dir, type Reference } from "./graph/semantics";
import type { StumblespaceSettings } from "./settings/schema";

export type Role = "current" | "ancestor" | "sibling" | "child" | "grandchild" | "semantic";

export interface Position {
	x: number;
	y: number;
	role: Role;
	dir?: Dir;
	ghost?: boolean;
	targetText?: string;
	/** Count of hidden grandchildren when this slot stands in for them. */
	moreCount?: number;
}

export type PositionMap = Map<string, Position>;

interface LayoutInput {
	currentId: string;
	ancestors: string[];
	siblings: string[];
	children: string[];
	/** Map from child ID → its children IDs */
	grandchildrenByKid: Map<string, string[]>;
	references: Reference[];
	settings: StumblespaceSettings;
}

const ARCS: [number, number][] = [[195, 265], [275, 345]];
const DIR_ORDER: Record<Dir, number> = { out: 0, mutual: 1, in: 2 };

export function layout(input: LayoutInput): PositionMap {
	const pos: PositionMap = new Map();

	// Current at center
	pos.set(input.currentId, { x: 50, y: 50, role: "current" });

	// Ancestors: vertical spine above, capped at 2
	for (let i = 0; i < Math.min(input.ancestors.length, 2); i++) {
		pos.set(input.ancestors[i]!, { x: 50, y: 50 - (i + 1) * 14, role: "ancestor" });
	}

	// Siblings: distribute evenly left and right of center, capped to fit
	const sibs = input.siblings;
	const leftSibs = sibs.filter((_, i) => i % 2 === 0);
	const rightSibs = sibs.filter((_, i) => i % 2 === 1);
	const maxSide = Math.max(leftSibs.length, rightSibs.length);
	const sibGap = maxSide > 0 ? Math.min(18, 40 / maxSide) : 18;
	for (let i = 0; i < leftSibs.length; i++) {
		pos.set(leftSibs[i]!, { x: 50 - sibGap * (i + 1), y: 50, role: "sibling" });
	}
	for (let i = 0; i < rightSibs.length; i++) {
		pos.set(rightSibs[i]!, { x: 50 + sibGap * (i + 1), y: 50, role: "sibling" });
	}

	// Children fan at y=66 (moved up from 72 to give grandchildren more vertical
	// room) — gap shrinks to keep outermost within [10, 90].
	const kids = input.children;
	const kidCount = kids.length;
	const kidGap = kidCount > 1 ? Math.min(18, 80 / (kidCount - 1)) : 18;
	for (let i = 0; i < kidCount; i++) {
		const x = 50 + (i - (kidCount - 1) / 2) * kidGap;
		pos.set(kids[i]!, { x, y: 66, role: "child" });
	}

	// Grandchildren — only when current has ≤2 children. Each kid's
	// grandchildren stack vertically directly under the kid with a fixed gap.
	// Cap visible at 4: if more exist, show first 3 + a synthetic "+N more"
	// indicator at slot 4. Synthetic id format: "<kidId>__more".
	if (kidCount <= 2) {
		const baseY = 80;
		const rowSpacing = 6;
		const MAX_VISIBLE = 4;
		for (const kid of kids) {
			const gks = input.grandchildrenByKid.get(kid) ?? [];
			const kidPos = pos.get(kid);
			if (!kidPos || gks.length === 0) continue;

			const overflow = gks.length > MAX_VISIBLE;
			const visibleCount = overflow ? MAX_VISIBLE - 1 : gks.length;

			for (let i = 0; i < visibleCount; i++) {
				pos.set(gks[i]!, {
					x: kidPos.x,
					y: baseY + i * rowSpacing,
					role: "grandchild",
				});
			}
			if (overflow) {
				pos.set(`${kid}__more`, {
					x: kidPos.x,
					y: baseY + (MAX_VISIBLE - 1) * rowSpacing,
					role: "grandchild",
					moreCount: gks.length - visibleCount,
				});
			}
		}
	}

	// Halo: semantic references on arc, grouped by direction.
	// effectiveSemantics applies the show-incoming/mutual toggle.
	const filteredRefs = effectiveSemantics(input.references, input.settings);
	const semantics = filteredRefs.filter((n) => !pos.has(n.id));
	const sorted = [...semantics].sort((a, b) => {
		const da = DIR_ORDER[a.dir], db = DIR_ORDER[b.dir];
		if (da !== db) return da - db;
		return a.id.localeCompare(b.id);
	});

	const N = sorted.length;
	if (N > 0) {
		const totalDeg = ARCS.reduce((s, [a0, a1]) => s + (a1 - a0), 0);
		for (let i = 0; i < N; i++) {
			const t01 = (i + 0.5) / N;
			let target = t01 * totalDeg;
			let ang = ARCS[0]![0];
			for (const [a0, a1] of ARCS) {
				const w = a1 - a0;
				if (target <= w) { ang = a0 + target; break; }
				target -= w;
			}
			const a = (ang * Math.PI) / 180;
			const rOff = i % 2 === 1 ? 5 : 0;
			const rawX = 50 + Math.cos(a) * (40 + rOff);
			const rawY = 50 + Math.sin(a) * (37 + rOff);
			// Clamp to safe canvas zone so cards never cross the viewport edge.
			const x = Math.max(10, Math.min(90, rawX));
			const y = Math.max(10, Math.min(90, rawY));
			const ref = sorted[i]!;
			pos.set(ref.id, { x, y, role: "semantic", dir: ref.dir, ghost: ref.ghost, targetText: ref.targetText });
		}
	}

	return pos;
}
