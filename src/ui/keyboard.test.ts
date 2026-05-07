import { describe, it, expect } from "vitest";
import { nearestInDirection } from "./keyboard";
import type { PositionMap } from "../layout";

function makePositions(entries: [string, number, number][]): PositionMap {
	const m: PositionMap = new Map();
	for (const [id, x, y] of entries) {
		m.set(id, { x, y, role: "semantic" });
	}
	return m;
}

describe("nearestInDirection", () => {
	const positions = makePositions([
		["center", 50, 50],
		["right", 70, 50],
		["left", 30, 50],
		["above", 50, 30],
		["below", 50, 70],
		["diag-ur", 65, 35],
	]);

	it("finds node to the right", () => {
		expect(nearestInDirection(1, 0, positions, "center")).toBe("right");
	});

	it("finds node to the left", () => {
		expect(nearestInDirection(-1, 0, positions, "center")).toBe("left");
	});

	it("finds node above", () => {
		expect(nearestInDirection(0, -1, positions, "center")).toBe("above");
	});

	it("finds node below", () => {
		expect(nearestInDirection(0, 1, positions, "center")).toBe("below");
	});

	it("returns null when no node in direction", () => {
		const small = makePositions([["a", 50, 50], ["b", 30, 50]]);
		expect(nearestInDirection(1, 0, small, "a")).toBeNull();
	});

	it("returns null for unknown focus", () => {
		expect(nearestInDirection(1, 0, positions, "nonexistent")).toBeNull();
	});

	it("returns null for null focus", () => {
		expect(nearestInDirection(1, 0, positions, null)).toBeNull();
	});

	it("prefers closer node when multiple in same direction", () => {
		const p = makePositions([
			["src", 50, 50],
			["near", 60, 50],
			["far", 80, 50],
		]);
		expect(nearestInDirection(1, 0, p, "src")).toBe("near");
	});

	it("skips nodes too far off-axis", () => {
		const p = makePositions([
			["src", 50, 50],
			["offaxis", 52, 10],
		]);
		expect(nearestInDirection(0, -1, p, "src")).toBe("offaxis");
		// But if the offset is too lateral relative to primary movement, skip
		const p2 = makePositions([
			["src", 50, 50],
			["lateral", 90, 48],
		]);
		expect(nearestInDirection(0, -1, p2, "src")).toBeNull();
	});
});
