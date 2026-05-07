import { describe, it, expect } from "vitest";
import { extractSourceText } from "./folgezettel";

describe("extractSourceText", () => {
	it("extracts from wikilink string", () => {
		expect(extractSourceText("[[1.1a3 Some title]]")).toBe("1.1a3 Some title");
	});

	it("returns plain string as-is when no brackets", () => {
		expect(extractSourceText("1.1a3 Some title")).toBe("1.1a3 Some title");
	});

	it("extracts from object with link key", () => {
		expect(extractSourceText({ link: "[[2.1b Foo]]" })).toBe("2.1b Foo");
	});

	it("extracts from object with path key", () => {
		expect(extractSourceText({ path: "[[3.1c Bar]]" })).toBe("3.1c Bar");
	});

	it("extracts from object with plain string link key", () => {
		expect(extractSourceText({ link: "4.1d Baz" })).toBe("4.1d Baz");
	});

	it("returns null for null/undefined", () => {
		expect(extractSourceText(null)).toBeNull();
		expect(extractSourceText(undefined)).toBeNull();
	});

	it("returns null for number", () => {
		expect(extractSourceText(42)).toBeNull();
	});

	it("returns null for empty object", () => {
		expect(extractSourceText({})).toBeNull();
	});

	it("tries keys in priority order: link > path > id > original", () => {
		expect(extractSourceText({ original: "[[5.1 Orig]]", link: "[[5.1 Link]]" })).toBe("5.1 Link");
	});
});
