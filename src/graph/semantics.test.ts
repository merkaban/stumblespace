import { describe, it, expect } from "vitest";
import { effectiveSemantics, isFolgezettelRelative, type Reference } from "./semantics";
import { DEFAULT_SETTINGS } from "../settings/schema";

describe("isFolgezettelRelative", () => {
	it("self is relative", () => {
		expect(isFolgezettelRelative("1.1a3", "1.1a3")).toBe(true);
	});

	it("parent is relative", () => {
		expect(isFolgezettelRelative("1.1a3", "1.1a")).toBe(true);
	});

	it("grandparent is relative", () => {
		expect(isFolgezettelRelative("1.1a3", "1.1")).toBe(true);
	});

	it("child is relative", () => {
		expect(isFolgezettelRelative("1.1a3", "1.1a3a")).toBe(true);
	});

	it("deep descendant is relative", () => {
		expect(isFolgezettelRelative("1.1a3", "1.1a3a1")).toBe(true);
	});

	it("sibling is relative", () => {
		expect(isFolgezettelRelative("1.1a3a", "1.1a3b")).toBe(true);
	});

	it("different branch is not relative", () => {
		expect(isFolgezettelRelative("1.1a3", "2.1b")).toBe(false);
	});

	it("cousin is not relative", () => {
		expect(isFolgezettelRelative("1.1a3a", "1.1a2")).toBe(false);
	});

	it("unrelated roots are not relative", () => {
		expect(isFolgezettelRelative("1.1", "2.1")).toBe(false);
	});
});

describe("effectiveSemantics", () => {
	const refs: Reference[] = [
		{ id: "a", dir: "out" },
		{ id: "b", dir: "in" },
		{ id: "c", dir: "mutual" },
		{ id: "d", dir: "out", ghost: true, targetText: "d Ghost" },
	];

	it("identity when toggle on", () => {
		expect(effectiveSemantics(refs, DEFAULT_SETTINGS)).toEqual(refs);
	});

	it("drops incoming and demotes mutual when toggle off", () => {
		const result = effectiveSemantics(refs, { ...DEFAULT_SETTINGS, showIncomingAndMutual: false });
		expect(result).toEqual([
			{ id: "a", dir: "out" },
			{ id: "c", dir: "out" },
			{ id: "d", dir: "out", ghost: true, targetText: "d Ghost" },
		]);
	});

	it("preserves ghost flag and targetText after demotion", () => {
		const ghostMutual: Reference[] = [{ id: "g", dir: "mutual", ghost: true, targetText: "g Foo" }];
		const result = effectiveSemantics(ghostMutual, { ...DEFAULT_SETTINGS, showIncomingAndMutual: false });
		expect(result).toEqual([{ id: "g", dir: "out", ghost: true, targetText: "g Foo" }]);
	});
});
