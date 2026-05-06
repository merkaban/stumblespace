import { fzParent } from "./graph/folgezettel";
import type { PositionMap } from "./layout";
import type { StumblespaceView } from "./view";

const SPINE_ROLES = new Set(["current", "ancestor", "sibling", "child", "grandchild"]);

export class CanvasRenderer {
	private nodeEls = new Map<string, HTMLElement>();
	private fadeTimers = new Map<string, number>();
	private lastPositions: PositionMap = new Map();
	private canvas: HTMLElement;
	private svg: SVGSVGElement;
	private view: StumblespaceView;

	constructor(view: StumblespaceView, canvas: HTMLElement, svg: SVGSVGElement) {
		this.view = view;
		this.canvas = canvas;
		this.svg = svg;
	}

	render(positions: PositionMap): void {
		const visibleIds = new Set(positions.keys());

		for (const [id, pos] of positions) {
			let el = this.nodeEls.get(id);
			// Defensive: if el is detached (e.g. canvas was rebuilt) recreate it
			let isNew = !el;
			if (el && !this.canvas.contains(el)) {
				this.nodeEls.delete(id);
				isNew = true;
				el = undefined;
			}
			if (!el) {
				el = this.createNodeEl(id);
				this.nodeEls.set(id, el);
			}
			// Cancel any pending fade-out — this node is visible again
			const pending = this.fadeTimers.get(id);
			if (pending !== undefined) {
				window.clearTimeout(pending);
				this.fadeTimers.delete(id);
			}
			this.updateNodeEl(el, id, pos, isNew);
		}

		// Fade out removed nodes
		for (const [id, el] of this.nodeEls) {
			if (!visibleIds.has(id)) {
				// If a fading node holds focus, hand it back to the view container
				// so keyboard handler keeps receiving events.
				const active = activeDocument.activeElement;
				if (el === active || el.contains(active)) {
					this.view.contentEl.focus({ preventScroll: true });
				}
				el.addClass("ss-fading");
				const existing = this.fadeTimers.get(id);
				if (existing !== undefined) window.clearTimeout(existing);
				const timer = window.setTimeout(() => {
					this.fadeTimers.delete(id);
					if (!this.lastPositions.has(id) && el.parentNode) {
						el.remove();
						this.nodeEls.delete(id);
					}
				}, 400);
				this.fadeTimers.set(id, timer);
			}
		}

		this.lastPositions = positions;
		this.renderEdges(positions);
	}

	/** Redraw only edges (e.g. on resize — nodes reflow via CSS %). */
	redrawEdges(): void {
		if (this.lastPositions.size > 0) this.renderEdges(this.lastPositions);
	}

	destroy(): void {
		for (const timer of this.fadeTimers.values()) window.clearTimeout(timer);
		this.fadeTimers.clear();
		this.nodeEls.clear();
	}

	private createNodeEl(id: string): HTMLElement {
		const el = this.canvas.createDiv({ cls: "ss-node ss-fading" });
		el.createDiv({ cls: "ss-id", text: id });
		el.createDiv({ cls: "ss-title" });
		el.createDiv({ cls: "ss-leafbadge ss-hidden" });

		el.setCssStyles({ left: "50%", top: "50%" });
		el.setAttribute("role", "button");
		el.setAttribute("tabindex", "0");

		this.view.registerDomEvent(el, "click", (e: MouseEvent) => {
			e.stopPropagation();
			this.view.handleNodeClick(id, e);
		});
		// Middle-click → open in new tab (same as Mod+click)
		this.view.registerDomEvent(el, "auxclick", (e: MouseEvent) => {
			if (e.button !== 1) return;
			e.preventDefault();
			e.stopPropagation();
			this.view.handleNodeMiddleClick(id);
		});

		return el;
	}

	private updateNodeEl(el: HTMLElement, id: string, pos: { x: number; y: number; role: string; dir?: string; ghost?: boolean; targetText?: string; moreCount?: number }, isNew: boolean): void {
		const index = this.view.getIndex();
		const file = index.getNote(id);
		const idEl = el.querySelector(".ss-id");
		let title: string;
		if (pos.moreCount) {
			title = `+${pos.moreCount} more`;
			if (idEl) idEl.textContent = "";
		} else if (file) {
			title = file.basename.replace(/^\S+\s/, "");
			if (idEl) idEl.textContent = id;
		} else if (pos.ghost) {
			// Strip the ID prefix from the wikilink target to get the user-typed title.
			const t = (pos.targetText ?? "").replace(/^\S+\s*/, "").trim();
			title = t || "(no title)";
			if (idEl) idEl.textContent = id;
		} else {
			title = id;
			if (idEl) idEl.textContent = id;
		}

		const titleEl = el.querySelector(".ss-title");
		if (titleEl) titleEl.textContent = title;
		el.setAttribute("aria-label",
			pos.moreCount ? `Show ${pos.moreCount} more grandchildren` :
			pos.ghost ? `Create stub ${id}` : `${id} ${title}`);

		// Build class list (preserve fading state during transition)
		const classes = ["ss-node"];
		if (pos.role === "current") classes.push("ss-current");
		if (pos.role === "ancestor" || pos.role === "child") classes.push("ss-spine");
		if (pos.role === "sibling") classes.push("ss-spine");
		if (pos.role === "grandchild") classes.push("ss-spine", "ss-grandchild");
		if (pos.moreCount) classes.push("ss-grandchild-more");

		const badge = el.querySelector(".ss-leafbadge");
		let badgeVisible = false;
		if (pos.role === "semantic") {
			classes.push("ss-leaf");
			if (pos.dir) classes.push(`ss-dir-${pos.dir}`);
			if (pos.ghost) {
				classes.push("ss-ghost");
				if (badge) badge.textContent = "Missing";
				badgeVisible = true;
			} else {
				const childCount = index.getChildren(id).length;
				if (childCount > 0) {
					classes.push("ss-has-children");
					if (badge) badge.textContent = `${childCount}↓`;
					badgeVisible = true;
				}
			}
		}
		if (badge) badge.toggleClass("ss-hidden", !badgeVisible);

		if (this.view.state.kbFocus === id) classes.push("ss-kb-focus");
		el.className = classes.join(" ");

		// Expand button on every real note node (skip ghosts + "+N more" placeholders).
		const existingBtn = el.querySelector(".ss-expandbtn");
		const showBtn = !pos.ghost && !pos.moreCount;
		if (showBtn && !existingBtn) {
			const btn = el.createEl("button", { cls: "ss-expandbtn", text: "+", attr: { title: "Open note" } });
			this.view.registerDomEvent(btn, "click", (e: MouseEvent) => {
				e.stopPropagation();
				this.view.openFocusCard(id);
			});
		} else if (!showBtn && existingBtn) {
			existingBtn.remove();
		}

		el.setCssStyles({ left: `${pos.x}%`, top: `${pos.y}%` });

		if (isNew) {
			// Defer reveal to next frame so the CSS opacity transition (0 → 1) plays.
			requestAnimationFrame(() => { el.removeClass("ss-fading"); });
		} else {
			el.removeClass("ss-fading");
		}
	}

	private renderEdges(positions: PositionMap): void {
		while (this.svg.firstChild) this.svg.firstChild.remove();

		const w = this.canvas.clientWidth;
		const h = this.canvas.clientHeight;
		if (w === 0 || h === 0) return;

		// SVG marker defs — reusable arrowheads for direction-aware edges.
		const defs = this.svg.createSvg("defs");
		this.createMarker(defs, "ss-arr", "auto");
		this.createMarker(defs, "ss-arr-rev", "auto-start-reverse");

		const px = (id: string) => {
			const p = positions.get(id);
			if (!p) return { x: 0, y: 0 };
			return { x: (p.x * w) / 100, y: (p.y * h) / 100 };
		};

		// Spine edges (folgezettel parent→child).
		// kid→grandchild gets fan-attach geometry so each grandchild's edge
		// arrives at a distinct x along its top border — readable even when
		// grandchildren stack tightly in a single column.
		for (const [id, p] of positions) {
			if (p.moreCount) continue;  // indicator slot, no spine edge
			const parent = fzParent(id);
			if (!parent || !positions.has(parent)) continue;
			const parentPos = positions.get(parent);
			if (!parentPos) continue;
			if (!SPINE_ROLES.has(p.role) || !SPINE_ROLES.has(parentPos.role)) continue;

			if (parentPos.role === "child" && p.role === "grandchild") {
				this.drawGrandchildEdge(w, h, parent, id, parentPos, p);
				continue;
			}

			const a = px(parent);
			const b = px(id);
			const d = a.x === b.x
				? `M${a.x},${a.y + 26} L${b.x},${b.y - 26}`
				: `M${a.x},${a.y + 20} C${a.x},${(a.y + b.y) / 2} ${b.x},${(a.y + b.y) / 2} ${b.x},${b.y - 22}`;

			this.svgPath(d, { stroke: "var(--ss-violet)", "stroke-width": "1.9", fill: "none", opacity: ".82" });
		}

		// Truncated-ancestor indicator
		const currentId = this.view.state.currentId;
		if (currentId) {
			const totalAncs = this.view.getIndex().getAncestors(currentId).length;
			if (totalAncs > 2) {
				const xPx = (50 * w) / 100;
				const topAncCenterPx = (22 * h) / 100;
				const yBot = topAncCenterPx - 26;
				const yTop = yBot - Math.min(70, h * 0.1);
				const line = this.svg.createSvg("line");
				this.setSvgAttrs(line, {
					x1: xPx, y1: yBot, x2: xPx, y2: yTop,
					stroke: "var(--ss-violet)", "stroke-width": "1.6",
					"stroke-dasharray": "2 4", opacity: ".6", "stroke-linecap": "round",
				});
			}
		}

		// Semantic edges (direction-aware)
		if (!currentId) return;
		const refs = this.view.getIndex().getReferences(currentId);
		const dirMap = new Map(refs.map((r) => [r.id, r.dir]));

		for (const [id, p] of positions) {
			if (p.role !== "semantic") continue;
			const dir = dirMap.get(id);
			if (!dir) continue;

			const A = px(currentId);
			const B = px(id);
			const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
			const dx = mx - A.x, dy = my - A.y;
			const len = Math.hypot(dx, dy) || 1;
			const cx = mx + (dx / len) * 22;
			const cy = my + (dy / len) * 22;

			const attrs: Record<string, string | number> = {
				stroke: "var(--ss-amber)", color: "var(--ss-amber)",
				fill: "none", "stroke-dasharray": "2 4",
			};

			if (dir === "mutual") {
				Object.assign(attrs, {
					"stroke-width": "1.7", opacity: ".9",
					"marker-start": "url(#ss-arr-rev)", "marker-end": "url(#ss-arr)",
				});
			} else if (dir === "in") {
				Object.assign(attrs, {
					"stroke-width": "1.4", opacity: ".75",
					"marker-start": "url(#ss-arr-rev)",
				});
			} else {
				Object.assign(attrs, {
					"stroke-width": "1.4", opacity: ".75",
					"marker-end": "url(#ss-arr)",
				});
			}

			this.svgPath(`M${A.x},${A.y} Q${cx},${cy} ${B.x},${B.y}`, attrs);
		}
	}

	/**
	 * Kid → grandchild edge with fan-out attachment along the grandchild's
	 * top border. Uses layout-target percentages × canvas pixels rather than
	 * getBoundingClientRect, so animated transitions don't pull the edge to
	 * an interpolated visual position.
	 */
	private drawGrandchildEdge(
		canvasW: number,
		canvasH: number,
		kidId: string,
		gcId: string,
		kidPos: { x: number; y: number },
		gcPos: { x: number; y: number },
	): void {
		const kidEl = this.nodeEls.get(kidId);
		const gcEl = this.nodeEls.get(gcId);
		if (!kidEl || !gcEl) return;

		const kidH = kidEl.clientHeight;
		const gcW = gcEl.clientWidth;
		const gcH = gcEl.clientHeight;

		const kidCenterX = (kidPos.x / 100) * canvasW;
		const kidCenterY = (kidPos.y / 100) * canvasH;
		const gcCenterX = (gcPos.x / 100) * canvasW;
		const gcCenterY = (gcPos.y / 100) * canvasH;

		const cBotX = kidCenterX;
		const cBotY = kidCenterY + kidH / 2;
		const gx = gcCenterX - gcW / 2;
		const gy = gcCenterY - gcH / 2;
		const gw = gcW;

		// Find grandchild index within its kid's children.
		const siblings = this.view.getIndex().getChildren(kidId);
		const n = siblings.length;
		const gi = siblings.indexOf(gcId);

		const gcCenter = gx + gw / 2;
		const dx = gcCenter - cBotX;
		const horizSpread = Math.max(120, gw * 1.2);
		const tHoriz = Math.max(-1, Math.min(1, dx / horizSpread));
		const tRow = n > 1 ? (gi / (n - 1)) * 2 - 1 : 0;
		const t = tHoriz * 0.4 + tRow * 0.6;

		const ATTACH_SPREAD = 0.7;
		const range = ATTACH_SPREAD * 0.5;
		const attachT = 0.5 - t * range;
		const attachX = gx + gw * attachT;
		const attachY = gy;

		const dy = Math.max(40, attachY - cBotY);
		const cy1 = cBotY + dy * 0.55;
		const cy2 = attachY - dy * 0.25;

		const d = `M${cBotX},${cBotY} C${cBotX},${cy1} ${attachX},${cy2} ${attachX},${attachY}`;
		this.svgPath(d, {
			stroke: "var(--ss-violet)",
			"stroke-width": "1.7",
			fill: "none",
			opacity: ".8",
		});
	}

	private createMarker(parent: SVGElement, id: string, orient: string): SVGMarkerElement {
		const marker = parent.createSvg("marker", {
			attr: {
				id, viewBox: "0 0 10 10", refX: 9, refY: 5,
				markerWidth: 5, markerHeight: 5, orient,
			},
		});
		marker.createSvg("path", {
			attr: { d: "M0,0 L10,5 L0,10 z", fill: "currentColor" },
		});
		return marker;
	}

	private svgPath(d: string, attrs: Record<string, string | number>): void {
		const path = this.svg.createSvg("path", { attr: { d } });
		this.setSvgAttrs(path, attrs);
	}

	/** Set SVG attributes — paint props go through style.setProperty so var() resolves. */
	private setSvgAttrs(el: SVGElement, attrs: Record<string, string | number>): void {
		const STYLE_PROPS = new Set(["stroke", "fill", "color", "opacity", "stroke-width",
			"stroke-dasharray", "stroke-linecap"]);
		for (const [k, v] of Object.entries(attrs)) {
			if (STYLE_PROPS.has(k)) {
				el.style.setProperty(k, String(v));
			} else {
				el.setAttribute(k, String(v));
			}
		}
	}
}
