import { describe, it, expect } from "vitest";
import { isFolgezettelRelative } from "./semantics";

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
