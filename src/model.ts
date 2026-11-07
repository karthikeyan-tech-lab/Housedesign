import polygonClipping from "polygon-clipping";
export type Point = { x: number; y: number };
export type Room = {
  id: string;
  kind: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
};
export type Edge = "top" | "right" | "bottom" | "left";
export type Opening = {
  id: string;
  kind: "door" | "window";
  owner: string;
  edge: Edge;
  offset: number;
  width: number;
  flip: boolean;
};
export type Floor = { rooms: Room[]; walls: Room[]; openings: Opening[] };
export type Design = {
  version: 1;
  name: string;
  plot: Point[];
  bearing: number;
  wall: number;
  floors: [Floor, Floor];
};
export const uid = () => crypto.randomUUID();
export const templates = [
  { kind: "hall", name: "Hall / Living", w: 11, h: 12, color: "#e6eddc" },
  { kind: "bedroom", name: "Bedroom", w: 10, h: 11, color: "#e8dfef" },
  { kind: "kitchen", name: "Kitchen", w: 8, h: 8, color: "#f6e5c9" },
  { kind: "pooja", name: "Pooja", w: 3, h: 4, color: "#f5efc6" },
  { kind: "bathroom", name: "Bathroom", w: 5, h: 7, color: "#dcebf0" },
  { kind: "toilet", name: "Toilet", w: 4, h: 5, color: "#d4e6e9" },
  { kind: "dining", name: "Dining", w: 7, h: 8, color: "#f1ddcf" },
  { kind: "utility", name: "Utility", w: 4, h: 4, color: "#e0e7e5" },
  { kind: "staircase", name: "Staircase", w: 5, h: 11, color: "#dedfd7" },
  { kind: "porch", name: "Entrance / Porch", w: 6, h: 5, color: "#e6e8d6" },
  { kind: "passage", name: "Passage", w: 3, h: 10, color: "#f0eee7" },
];
export const color = (kind: string) =>
  templates.find((t) => t.kind === kind)?.color || "#d8ddd9";
export const area = (p: Point[]) =>
  Math.abs(
    p.reduce((s, a, i) => {
      const b = p[(i + 1) % p.length];
      return s + a.x * b.y - b.x * a.y;
    }, 0),
  ) / 2;
export const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y);
export const bounds = (p: Point[]) => ({
  minX: Math.min(...p.map((v) => v.x)),
  minY: Math.min(...p.map((v) => v.y)),
  maxX: Math.max(...p.map((v) => v.x)),
  maxY: Math.max(...p.map((v) => v.y)),
});
// Frontage is P4 -> P3. Fix the left side perpendicular to it and solve the
// circle intersection for a 15 ft rear edge and 43.5 ft right boundary.
export function initialPlot(): Point[] {
  const cx = 15,
    cy = 45,
    d = Math.hypot(cx, cy);
  const a = (15 ** 2 - 43.5 ** 2 + d ** 2) / (2 * d);
  const h = Math.sqrt(15 ** 2 - a ** 2);
  return [
    { x: 0, y: 0 },
    { x: (a * cx) / d + (h * cy) / d, y: (a * cy) / d - (h * cx) / d },
    { x: 15, y: 45 },
    { x: 0, y: 45 },
  ];
}
const ring = (p: Point[]) => [
  ...p.map((v) => [v.x, v.y] as [number, number]),
  [p[0].x, p[0].y] as [number, number],
];
const rect = (r: Room) =>
  ring([
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ]);
const multiArea = (m: polygonClipping.MultiPolygon) =>
  m.reduce(
    (s, p) =>
      s +
      p.reduce(
        (v, r, i) => v + (i ? -1 : 1) * area(r.map(([x, y]) => ({ x, y }))),
        0,
      ),
    0,
  );
export function validPlot(p: Point[]) {
  if (
    p.length !== 4 ||
    p.some(
      (v) =>
        !Number.isFinite(v.x) ||
        !Number.isFinite(v.y) ||
        Math.abs(v.x) > 1000 ||
        Math.abs(v.y) > 1000,
    )
  )
    return false;
  const cross = p.map((a, i) => {
    const b = p[(i + 1) % 4],
      c = p[(i + 2) % 4];
    return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
  });
  return area(p) >= 10 && cross.every((v) => v > 0.001);
}
export function metrics(d: Design, f: Floor) {
  const objects = [...f.rooms, ...f.walls];
  const shapes = objects.map((r) => [rect(r)] as polygonClipping.Polygon);
  const union = shapes.length
    ? polygonClipping.union(shapes[0], ...shapes.slice(1))
    : [];
  const occupied = multiArea(union);
  const inside = shapes.length
    ? multiArea(polygonClipping.intersection([ring(d.plot)], union))
    : 0;
  const usable = f.rooms.reduce(
    (s, r) => s + Math.max(0, r.w - 2 * d.wall) * Math.max(0, r.h - 2 * d.wall),
    0,
  );
  return {
    plot: area(d.plot),
    occupied,
    inside,
    unassigned: Math.max(0, area(d.plot) - inside),
    usable,
  };
}
export function openingPoint(r: Room, o: Opening): Point {
  const len = o.edge === "top" || o.edge === "bottom" ? r.w : r.h;
  const along =
    Math.min(Math.max(0, o.offset), Math.max(0, len - o.width)) +
    Math.min(o.width, len) / 2;
  return {
    x: r.x + (o.edge === "left" ? 0 : o.edge === "right" ? r.w : along),
    y: r.y + (o.edge === "top" ? 0 : o.edge === "bottom" ? r.h : along),
  };
}
export function normalizeFloor(f: Floor): Floor {
  const objects = [...f.rooms, ...f.walls];
  return {
    ...f,
    openings: f.openings
      .filter((o) => objects.some((r) => r.id === o.owner))
      .map((o) => {
        const r = objects.find((r) => r.id === o.owner)!;
        const len = ["top", "bottom"].includes(o.edge) ? r.w : r.h;
        return {
          ...o,
          width: Math.min(o.width, len),
          offset: Math.max(0, Math.min(o.offset, len - Math.min(o.width, len))),
        };
      }),
  };
}
export type Issue = {
  ids: string[];
  message: string;
  level: "error" | "warning";
};
export function issues(d: Design, f: Floor): Issue[] {
  const out: Issue[] = [],
    all = [...f.rooms, ...f.walls];
  for (const r of all) {
    const inside = multiArea(
      polygonClipping.intersection([ring(d.plot)], [rect(r)]),
    );
    if (r.w * r.h - inside > 0.01)
      out.push({
        ids: [r.id],
        message: `${r.name} extends outside the plot.`,
        level: "error",
      });
    if (f.rooms.includes(r) && Math.min(r.w, r.h) <= 2 * d.wall)
      out.push({
        ids: [r.id],
        message: `${r.name} has no clear space after wall thickness.`,
        level: "error",
      });
  }
  f.rooms.forEach((a, i) =>
    f.rooms.slice(i + 1).forEach((b) => {
      if (
        Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.01 &&
        Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.01
      )
        out.push({
          ids: [a.id, b.id],
          message: `${a.name} overlaps ${b.name}.`,
          level: "error",
        });
    }),
  );
  // Schematic connectivity: traverse door openings across coincident room edges.
  // A door opening into unassigned space starts a route, not a legal access certification.
  const links = new Map<string, Set<string>>(),
    reachable = new Set<string>();
  for (const r of f.rooms) links.set(r.id, new Set());
  for (const o of f.openings.filter((o) => o.kind === "door")) {
    const owner = f.rooms.find((r) => r.id === o.owner);
    if (!owner) continue;
    const p = openingPoint(owner, o),
      vertical = o.edge === "left" || o.edge === "right";
    const other = f.rooms.filter(
      (r) =>
        r.id !== owner.id &&
        (vertical
          ? Math.min(Math.abs(p.x - r.x), Math.abs(p.x - r.x - r.w)) < 0.08 &&
            p.y > r.y &&
            p.y < r.y + r.h
          : Math.min(Math.abs(p.y - r.y), Math.abs(p.y - r.y - r.h)) < 0.08 &&
            p.x > r.x &&
            p.x < r.x + r.w),
    );
    if (!other.length) reachable.add(owner.id);
    other.forEach((r) => {
      links.get(owner.id)!.add(r.id);
      links.get(r.id)!.add(owner.id);
    });
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of reachable)
      for (const next of links.get(id) || [])
        if (!reachable.has(next)) {
          reachable.add(next);
          changed = true;
        }
  }
  f.rooms
    .filter((r) => !reachable.has(r.id))
    .forEach((r) =>
      out.push({
        ids: [r.id],
        message: `${r.name}: no schematic door route to open space.`,
        level: "warning",
      }),
    );
  f.openings.forEach((o, i) => {
    const a = all.find((r) => r.id === o.owner);
    if (!a) return;
    f.openings
      .slice(i + 1)
      .filter(
        (v) =>
          v.owner === o.owner &&
          v.edge === o.edge &&
          Math.min(o.offset + o.width, v.offset + v.width) >
            Math.max(o.offset, v.offset),
      )
      .forEach((v) =>
        out.push({
          ids: [o.id, v.id],
          message: "Door/window openings overlap.",
          level: "error",
        }),
      );
  });
  return out;
}
export const bearingName = (bearing: number) =>
  ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(bearing / 45) % 8];
export function direction(d: Design, p: Point) {
  const b = bounds(d.plot),
    dx = p.x - (b.minX + b.maxX) / 2,
    dy = p.y - (b.minY + b.maxY) / 2;
  const front =
    (Math.atan2(d.plot[2].y - d.plot[3].y, d.plot[2].x - d.plot[3].x) * 180) /
    Math.PI;
  const angle =
    (((d.bearing + (Math.atan2(dx, -dy) * 180) / Math.PI - 180 - front) % 360) +
      360) %
    360;
  return bearingName(angle);
}
export function vastu(d: Design, r: Room) {
  const prefs: Record<string, string[]> = {
    kitchen: ["E", "SE"],
    pooja: ["NE"],
    bedroom: ["SW"],
    porch: ["N", "E", "NE"],
    staircase: ["S", "W", "SW"],
  };
  const dir = direction(d, { x: r.x + r.w / 2, y: r.y + r.h / 2 });
  return prefs[r.kind]
    ? `${r.name}: ${dir}${prefs[r.kind].includes(dir) ? " · preferred zone" : ` · traditionally ${prefs[r.kind].join(" / ")}`}`
    : null;
}
export const blankFloor = (): Floor => ({ rooms: [], walls: [], openings: [] });
export function layout(index: number): Floor {
  const rooms: Room[] = [];
  const add = (kind: string, x: number, y: number, w: number, h: number) => {
    const t = templates.find((t) => t.kind === kind)!;
    rooms.push({ id: uid(), kind, name: t.name, x, y, w, h });
  };
  if (index === 0) {
    add("bedroom", 0.5, 2, 10, 11);
    add("bathroom", 10.5, 2, 4, 7);
    add("kitchen", 0.5, 13, 8, 8);
    add("utility", 10.5, 9, 4, 4);
    add("pooja", 10.5, 13, 4, 4);
    add("hall", 0.5, 23, 10, 12);
    add("staircase", 10.5, 23, 4, 12);
    add("porch", 0.5, 35, 10, 6);
  }
  if (index === 1) {
    add("bedroom", 0.5, 2, 10, 11);
    add("bathroom", 10.5, 2, 4, 7);
    add("kitchen", 0.5, 13, 8, 8);
    add("pooja", 10.5, 13, 4, 4);
    add("hall", 0.5, 22, 14, 13);
    add("staircase", 10.5, 35, 4, 9);
    add("porch", 0.5, 35, 10, 6);
  }
  if (index === 2) {
    add("bedroom", 0.5, 2, 10, 11);
    add("bathroom", 10.5, 2, 4, 7);
    add("kitchen", 0.5, 13, 7, 8);
    add("dining", 7.5, 13, 7, 8);
    add("pooja", 10.5, 9, 4, 4);
    add("hall", 0.5, 23, 10, 11);
    add("staircase", 10.5, 23, 4, 11);
    add("porch", 0.5, 34, 10, 7);
  }
  if (index === 3) {
    add("bedroom", 0.5, 2, 10, 11);
    add("bathroom", 10.5, 2, 4, 7);
    add("utility", 10.5, 9, 4, 4);
    add("kitchen", 0.5, 15, 7, 8);
    add("hall", 0.5, 23, 10, 14);
    add("dining", 7.5, 15, 7, 8);
    add("staircase", 10.5, 23, 4, 12);
    add("pooja", 10.5, 35, 4, 4);
    add("porch", 0.5, 37, 10, 6);
  }
  const openings: Opening[] = rooms.map((r) => ({
    id: uid(),
    kind: "door",
    owner: r.id,
    edge: "bottom",
    offset: Math.max(0, (r.w - 2.5) / 2),
    width: 2.5,
    flip: false,
  }));
  if (index === 3) {
    const kitchen = rooms.find((r) => r.kind === "kitchen")!;
    openings.find((o) => o.owner === kitchen.id)!.width = 6;
  }
  return { rooms, walls: [], openings };
}
export function createDesign(): Design {
  return {
    version: 1,
    name: "My NE-facing home",
    plot: initialPlot(),
    bearing: 39,
    wall: 0.375,
    floors: [layout(0), blankFloor()],
  };
}
export function parseDesign(raw: string): Design {
  if (raw.length > 2_000_000)
    throw new Error("File is too large (maximum 2 MB).");
  const d = JSON.parse(raw) as Design;
  const num = (v: unknown, lo: number, hi: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
  const str = (v: unknown) =>
    typeof v === "string" && v.length > 0 && v.length <= 120;
  if (
    !d ||
    d.version !== 1 ||
    !str(d.name) ||
    !Array.isArray(d.plot) ||
    !validPlot(d.plot) ||
    !num(d.bearing, 0, 359.999) ||
    !num(d.wall, 0.05, 2) ||
    !Array.isArray(d.floors) ||
    d.floors.length !== 2
  )
    throw new Error("Invalid HouseDesign v1 file or plot geometry.");
  const ids = new Set<string>();
  for (const f of d.floors) {
    if (
      !f ||
      ![f.rooms, f.walls, f.openings].every(
        (a) => Array.isArray(a) && a.length <= 200,
      )
    )
      throw new Error("Invalid floor data (maximum 200 items per category).");
    for (const r of [...f.rooms, ...f.walls]) {
      if (
        !r ||
        !str(r.id) ||
        ids.has(r.id) ||
        !str(r.kind) ||
        !str(r.name) ||
        !num(r.x, -1000, 1000) ||
        !num(r.y, -1000, 1000) ||
        !num(r.w, 0.05, 200) ||
        !num(r.h, 0.05, 200)
      )
        throw new Error("Invalid room or wall.");
      ids.add(r.id);
    }
    for (const o of f.openings) {
      const owner = [...f.rooms, ...f.walls].find((r) => r.id === o?.owner);
      if (
        !o ||
        !str(o.id) ||
        ids.has(o.id) ||
        !owner ||
        !["door", "window"].includes(o.kind) ||
        !["top", "bottom", "left", "right"].includes(o.edge) ||
        !num(o.offset, 0, 200) ||
        !num(o.width, 0.1, 200) ||
        typeof o.flip !== "boolean"
      )
        throw new Error("Invalid door/window.");
      const len = ["top", "bottom"].includes(o.edge) ? owner.w : owner.h;
      if (o.offset + o.width > len + 0.001)
        throw new Error("An opening exceeds its wall.");
      ids.add(o.id);
    }
  }
  // Whitelist properties, leaving untrusted JSON out of application prototypes.
  return {
    version: 1,
    name: d.name,
    plot: d.plot.map(({ x, y }) => ({ x, y })),
    bearing: d.bearing,
    wall: d.wall,
    floors: d.floors.map((f) => ({
      rooms: f.rooms.map((r) => ({
        id: r.id,
        kind: r.kind,
        name: r.name,
        x: r.x,
        y: r.y,
        w: r.w,
        h: r.h,
      })),
      walls: f.walls.map((r) => ({
        id: r.id,
        kind: r.kind,
        name: r.name,
        x: r.x,
        y: r.y,
        w: r.w,
        h: r.h,
      })),
      openings: f.openings.map((o) => ({
        id: o.id,
        kind: o.kind,
        owner: o.owner,
        edge: o.edge,
        offset: o.offset,
        width: o.width,
        flip: o.flip,
      })),
    })) as [Floor, Floor],
  };
}
export const formatFeet = (v: number) => {
  const inches = Math.round(v * 24) / 2;
  return `${Math.floor(inches / 12)}′ ${inches % 12}″`;
};
