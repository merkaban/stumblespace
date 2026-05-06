/**
 * Smoke benchmark: synthesize 5000-note vault, time graph queries + layout.
 * Submission target (implementation-plan §M6): layout <5ms, render <16ms.
 * Render touches DOM/Obsidian — cannot bench in pure Node. Pure-logic only here.
 */
import { describe, it, expect } from "vitest";
import { layout } from "./layout";
import { fzAncestors, fzChildren, fzParent, fzSiblings } from "./graph/folgezettel";
import { isFolgezettelRelative, type Reference } from "./graph/semantics";
import { DEFAULT_SETTINGS } from "./settings/schema";

/** Mirror of VaultIndex's pre-computed children-by-parent index. */
function buildChildIndex(allIds: Set<string>): Map<string, string[]> {
	const m = new Map<string, string[]>();
	for (const id of allIds) {
		const p = fzParent(id);
		if (p && allIds.has(p)) {
			let kids = m.get(p);
			if (!kids) { kids = []; m.set(p, kids); }
			kids.push(id);
		}
	}
	for (const kids of m.values()) kids.sort();
	return m;
}

const LETTERS = "abcdefghijklmnopqrstuvwxyz";

function generateIds(): string[] {
	// 10 roots × 20 letter children × 25 numeric grandchildren = 5000 nodes
	// (plus the roots and letter children themselves = 5210 total)
	const ids: string[] = [];
	for (let r = 1; r <= 10; r++) {
		const root = `${r}.1`;
		ids.push(root);
		for (let li = 0; li < 20; li++) {
			const letter = LETTERS[li]!;
			const child = `${root}${letter}`;
			ids.push(child);
			for (let n = 1; n <= 25; n++) {
				ids.push(`${child}${n}`);
			}
		}
	}
	return ids;
}

function median(xs: number[]): number {
	const s = [...xs].sort((a, b) => a - b);
	return s[Math.floor(s.length / 2)]!;
}

function p95(xs: number[]): number {
	const s = [...xs].sort((a, b) => a - b);
	return s[Math.floor(s.length * 0.95)]!;
}

describe("5000-note smoke bench", () => {
	const ids = generateIds();
	const allIds = new Set(ids);
	const childIndex = buildChildIndex(allIds);
	const getChildren = (id: string) => childIndex.get(id) ?? [];
	const getSiblings = (id: string) => {
		const p = fzParent(id);
		if (!p) return [];
		return (childIndex.get(p) ?? []).filter((k) => k !== id);
	};

	it("vault size sanity", () => {
		expect(ids.length).toBeGreaterThanOrEqual(5000);
		console.log(`  vault size: ${ids.length} ids, childIndex parents: ${childIndex.size}`);
	});

	it("buildChildIndex (one-time on rebuild): target <50ms", () => {
		const samples: number[] = [];
		for (let i = 0; i < 10; i++) {
			const t0 = performance.now();
			buildChildIndex(allIds);
			samples.push(performance.now() - t0);
		}
		const med = median(samples);
		console.log(`  buildChildIndex (${allIds.size} ids): median=${med.toFixed(2)}ms p95=${p95(samples).toFixed(2)}ms`);
		expect(med).toBeLessThan(50);
	});

	it("getChildren on a leaf-parent (indexed): target <0.1ms median", () => {
		const target = "5.1m";
		const samples: number[] = [];
		for (let i = 0; i < 100; i++) {
			const t0 = performance.now();
			getChildren(target);
			samples.push(performance.now() - t0);
		}
		const med = median(samples);
		console.log(`  getChildren(${target}): median=${med.toFixed(4)}ms p95=${p95(samples).toFixed(4)}ms`);
		expect(med).toBeLessThan(1);
	});

	it("fzAncestors on a deep node: target <0.1ms median", () => {
		const target = "5.1m12";
		const samples: number[] = [];
		for (let i = 0; i < 100; i++) {
			const t0 = performance.now();
			fzAncestors(target, allIds);
			samples.push(performance.now() - t0);
		}
		const med = median(samples);
		console.log(`  fzAncestors(${target}): median=${med.toFixed(3)}ms p95=${p95(samples).toFixed(3)}ms`);
		expect(med).toBeLessThan(1);
	});

	it("getSiblings on a leaf (indexed): target <0.1ms median", () => {
		const target = "5.1m12";
		const samples: number[] = [];
		for (let i = 0; i < 100; i++) {
			const t0 = performance.now();
			getSiblings(target);
			samples.push(performance.now() - t0);
		}
		const med = median(samples);
		console.log(`  getSiblings(${target}): median=${med.toFixed(4)}ms p95=${p95(samples).toFixed(4)}ms`);
		expect(med).toBeLessThan(1);
	});

	it("fzChildren legacy O(N) scan baseline: target <50ms median", () => {
		// Demonstrates why the index matters — kept as a perf reference.
		const target = "5.1m";
		const samples: number[] = [];
		for (let i = 0; i < 20; i++) {
			const t0 = performance.now();
			fzChildren(target, allIds);
			samples.push(performance.now() - t0);
		}
		const med = median(samples);
		console.log(`  [baseline] fzChildren O(N): median=${med.toFixed(2)}ms p95=${p95(samples).toFixed(2)}ms`);
		expect(med).toBeLessThan(50);
	});

	it("fzSiblings legacy O(N) scan baseline: target <50ms median", () => {
		const target = "5.1m12";
		const samples: number[] = [];
		for (let i = 0; i < 20; i++) {
			const t0 = performance.now();
			fzSiblings(target, allIds);
			samples.push(performance.now() - t0);
		}
		const med = median(samples);
		console.log(`  [baseline] fzSiblings O(N): median=${med.toFixed(2)}ms p95=${p95(samples).toFixed(2)}ms`);
		expect(med).toBeLessThan(50);
	});

	it("layout() on realistic input: target <5ms median", () => {
		const currentId = "5.1m";
		const ancestors = fzAncestors(currentId, allIds);
		const siblings = getSiblings(currentId);
		const children = getChildren(currentId);
		const grandchildrenByKid = new Map<string, string[]>();
		for (const kid of children) {
			grandchildrenByKid.set(kid, getChildren(kid));
		}
		// Synthesize 15 references (typical realistic count)
		const references: Reference[] = [];
		const targets = ["1.1a3", "2.1b5", "3.1c1", "4.1d2", "6.1e4", "7.1f7", "8.1g9", "9.1h11", "10.1i13", "1.1j15", "2.1k17", "3.1l19", "4.1m21", "6.1n23", "7.1o25"];
		for (let i = 0; i < targets.length; i++) {
			const tid = targets[i]!;
			if (isFolgezettelRelative(currentId, tid)) continue;
			const dir = i % 3 === 0 ? "out" : i % 3 === 1 ? "in" : "mutual";
			references.push({ id: tid, dir });
		}

		const samples: number[] = [];
		for (let i = 0; i < 100; i++) {
			const t0 = performance.now();
			layout({
				currentId,
				ancestors,
				siblings,
				children,
				grandchildrenByKid,
				references,
				settings: DEFAULT_SETTINGS,
			});
			samples.push(performance.now() - t0);
		}
		const med = median(samples);
		console.log(`  layout() siblings=${siblings.length} children=${children.length} refs=${references.length}: median=${med.toFixed(3)}ms p95=${p95(samples).toFixed(3)}ms`);
		expect(med).toBeLessThan(5);
	});

	it("full per-recenter pipeline: index queries + layout: target <16ms median", () => {
		// Simulates one recenter: resolve graph for currentId, then call layout.
		const currentId = "5.1m";

		const samples: number[] = [];
		for (let i = 0; i < 50; i++) {
			const t0 = performance.now();
			const ancestors = fzAncestors(currentId, allIds);
			const siblings = getSiblings(currentId);
			const children = getChildren(currentId);
			const grandchildrenByKid = new Map<string, string[]>();
			for (const kid of children) {
				grandchildrenByKid.set(kid, getChildren(kid));
			}
			const references: Reference[] = [];
			layout({
				currentId,
				ancestors,
				siblings,
				children,
				grandchildrenByKid,
				references,
				settings: DEFAULT_SETTINGS,
			});
			samples.push(performance.now() - t0);
		}
		const med = median(samples);
		console.log(`  recenter pipeline (graph + layout): median=${med.toFixed(3)}ms p95=${p95(samples).toFixed(3)}ms`);
		expect(med).toBeLessThan(16);
	});

	it("rebuild scan equivalent (parseIdFromFilename × 5210)", async () => {
		const { parseIdFromFilename } = await import("./graph/folgezettel");
		const fakenames = ids.map((id, i) => `${id} Title number ${i}`);
		const samples: number[] = [];
		for (let i = 0; i < 20; i++) {
			const t0 = performance.now();
			for (const n of fakenames) parseIdFromFilename(n);
			samples.push(performance.now() - t0);
		}
		const med = median(samples);
		console.log(`  parseId × ${fakenames.length}: median=${med.toFixed(2)}ms p95=${p95(samples).toFixed(2)}ms`);
		expect(med).toBeLessThan(50);
	});
});
