import { describe, it, expect } from "vitest";
import { layout } from "./layout";
import { DEFAULT_SETTINGS } from "./settings/schema";

const baseInput = {
	currentId: "1.1a3",
	ancestors: ["1.1a", "1.1"],
	siblings: ["1.1a1", "1.1a2", "1.1a4"],
	children: ["1.1a3a", "1.1a3b", "1.1a3c"],
	grandchildrenByKid: new Map<string, string[]>(),
	references: [
		{ id: "2.1b", dir: "mutual" as const },
		{ id: "3.1c", dir: "mutual" as const },
		{ id: "4.1a", dir: "out" as const },
		{ id: "5.1f", dir: "out" as const },
		{ id: "2.1b2", dir: "in" as const },
	],
	settings: DEFAULT_SETTINGS,
};

describe("layout", () => {
	it("places current at center", () => {
		const pos = layout(baseInput);
		const cur = pos.get("1.1a3");
		expect(cur).toEqual({ x: 50, y: 50, role: "current" });
	});

	it("places ancestors above, nearest first", () => {
		const pos = layout(baseInput);
		expect(pos.get("1.1a")?.y).toBe(36); // 50 - 14
		expect(pos.get("1.1")?.y).toBe(22);  // 50 - 28
	});

	it("caps ancestors at 2", () => {
		const input = {
			...baseInput,
			ancestors: ["1.1a", "1.1", "1.0"], // 3 ancestors
		};
		const pos = layout(input);
		expect(pos.has("1.1a")).toBe(true);
		expect(pos.has("1.1")).toBe(true);
		expect(pos.has("1.0")).toBe(false);
	});

	it("fans children at y=72", () => {
		const pos = layout(baseInput);
		for (const kid of baseInput.children) {
			expect(pos.get(kid)?.y).toBe(72);
			expect(pos.get(kid)?.role).toBe("child");
		}
	});

	it("keeps many children within canvas bounds", () => {
		const input = {
			...baseInput,
			children: ["1.1a3a", "1.1a3b", "1.1a3c", "1.1a3d", "1.1a3e", "1.1a3f"],
		};
		const pos = layout(input);
		for (const kid of input.children) {
			const p = pos.get(kid)!;
			expect(p.x).toBeGreaterThanOrEqual(10);
			expect(p.x).toBeLessThanOrEqual(90);
		}
	});

	it("suppresses grandchildren when >2 children", () => {
		const input = {
			...baseInput,
			grandchildrenByKid: new Map([["1.1a3a", ["1.1a3a1"]]]),
		};
		const pos = layout(input);
		// 3 children → no grandchildren
		expect(pos.has("1.1a3a1")).toBe(false);
	});

	it("shows grandchildren when ≤2 children", () => {
		const input = {
			...baseInput,
			children: ["1.1a3a", "1.1a3b"],
			grandchildrenByKid: new Map([["1.1a3a", ["1.1a3a1"]]]),
		};
		const pos = layout(input);
		expect(pos.get("1.1a3a1")?.role).toBe("grandchild");
		expect(pos.get("1.1a3a1")?.y).toBe(90);
	});

	it("places semantic refs on halo, grouped by direction", () => {
		const pos = layout(baseInput);
		const semIds = [...pos.entries()]
			.filter(([, p]) => p.role === "semantic")
			.map(([id]) => id);
		expect(semIds).toHaveLength(5);

		// All should be above center (arcs are in upper half: 195°-345°)
		for (const id of semIds) {
			expect(pos.get(id)!.y).toBeLessThan(50);
		}
	});

	it("orders halo: out first, then mutual, then in", () => {
		const pos = layout(baseInput);
		const sems = [...pos.entries()]
			.filter(([, p]) => p.role === "semantic")
			.sort(([, a], [, b]) => a.x - b.x); // left to right

		// outgoing should be leftmost, incoming rightmost
		const dirs = sems.map(([, p]) => p.dir);
		const outIdx = dirs.indexOf("out");
		const inIdx = dirs.lastIndexOf("in");
		expect(outIdx).toBeLessThan(inIdx);
	});

	it("hides incoming and demotes mutual when showIncomingAndMutual is off", () => {
		const input = {
			...baseInput,
			settings: { ...DEFAULT_SETTINGS, showIncomingAndMutual: false },
		};
		const pos = layout(input);
		// Incoming dropped
		expect(pos.has("2.1b2")).toBe(false);
		// Mutuals demoted to out
		expect(pos.get("2.1b")?.dir).toBe("out");
		expect(pos.get("3.1c")?.dir).toBe("out");
		// Out remain
		expect(pos.get("4.1a")?.dir).toBe("out");
	});
});
