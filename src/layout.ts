import type { Dir, Reference } from "./graph/semantics";

export type Role = "current" | "ancestor" | "sibling" | "child" | "grandchild" | "semantic";

export interface Position {
	x: number;
	y: number;
	role: Role;
	dir?: Dir;
	ghost?: boolean;
	targetText?: string;
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

	// Children fan at y=72 — gap shrinks to keep outermost within [10, 90]
	const kids = input.children;
	const kidCount = kids.length;
	const kidGap = kidCount > 1 ? Math.min(18, 80 / (kidCount - 1)) : 18;
	for (let i = 0; i < kidCount; i++) {
		const x = 50 + (i - (kidCount - 1) / 2) * kidGap;
		pos.set(kids[i]!, { x, y: 72, role: "child" });
	}

	// Grandchildren at y=90, only when ≤2 children
	if (kidCount <= 2) {
		for (const kid of kids) {
			const gks = input.grandchildrenByKid.get(kid!) ?? [];
			const kidPos = pos.get(kid!);
			if (!kidPos) continue;
			for (let i = 0; i < gks.length; i++) {
				const x = kidPos.x + (i - (gks.length - 1) / 2) * 14;
				pos.set(gks[i]!, { x, y: 90, role: "grandchild" });
			}
		}
	}

	// Halo: semantic references on arc, grouped by direction
	const semantics = input.references.filter((n) => !pos.has(n.id));
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
			const x = 50 + Math.cos(a) * (40 + rOff);
			const y = 50 + Math.sin(a) * (37 + rOff);
			const ref = sorted[i]!;
			pos.set(ref.id, { x, y, role: "semantic", dir: ref.dir, ghost: ref.ghost, targetText: ref.targetText });
		}
	}

	return pos;
}
