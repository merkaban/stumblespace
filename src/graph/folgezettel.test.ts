import { describe, it, expect } from "vitest";
import {
	parseFz,
	fzParent,
	fzAncestors,
	fzChildren,
	fzSiblings,
} from "./folgezettel";

describe("parseFz", () => {
	it("parses simple root", () => {
		expect(parseFz("1.1")).toEqual(["1", "1"]);
	});

	it("parses with letter segment", () => {
		expect(parseFz("1.1a")).toEqual(["1", "1", "a"]);
	});

	it("parses deep alternating", () => {
		expect(parseFz("1.1a3b1")).toEqual(["1", "1", "a", "3", "b", "1"]);
	});

	it("parses multi-digit root", () => {
		expect(parseFz("12.3a")).toEqual(["12", "3", "a"]);
	});

	it("parses multi-digit segments", () => {
		expect(parseFz("2.17bc42")).toEqual(["2", "17", "bc", "42"]);
	});

	it("returns empty for no dot", () => {
		expect(parseFz("abc")).toEqual([]);
	});

	it("handles dot with only root", () => {
		expect(parseFz("5.")).toEqual(["5"]);
	});
});

describe("fzParent", () => {
	it("returns null for root", () => {
		expect(fzParent("1.1")).toBeNull();
	});

	it("returns parent one level up", () => {
		expect(fzParent("1.1a")).toBe("1.1");
	});

	it("returns parent for deep ID", () => {
		expect(fzParent("1.1a3b")).toBe("1.1a3");
	});
});

const testIds = new Set([
	"1.1",
	"1.1a",
	"1.1a1",
	"1.1a2",
	"1.1a3",
	"1.1a3a",
	"1.1a3a1",
	"1.1a3b",
	"1.1a3b1",
	"1.1a3c",
	"1.1b",
	"2.1",
	"2.1a",
	"2.1b",
]);

describe("fzAncestors", () => {
	it("returns nearest-first ancestors", () => {
		expect(fzAncestors("1.1a3", testIds)).toEqual(["1.1a", "1.1"]);
	});

	it("returns empty for root", () => {
		expect(fzAncestors("1.1", testIds)).toEqual([]);
	});
});

describe("fzChildren", () => {
	it("finds direct children", () => {
		expect(fzChildren("1.1a3", testIds)).toEqual([
			"1.1a3a",
			"1.1a3b",
			"1.1a3c",
		]);
	});

	it("returns empty when no children", () => {
		expect(fzChildren("1.1a3c", testIds)).toEqual([]);
	});
});

describe("fzSiblings", () => {
	it("finds siblings excluding self", () => {
		expect(fzSiblings("1.1a3a", testIds)).toEqual(["1.1a3b", "1.1a3c"]);
	});

	it("returns empty for root", () => {
		expect(fzSiblings("1.1", testIds)).toEqual([]);
	});
});
