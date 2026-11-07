import { test } from "node:test";
import assert from "node:assert/strict";
import {
  area,
  bounds,
  createDesign,
  direction,
  distance,
  formatFeet,
  initialPlot,
  issues,
  layout,
  metrics,
  normalizeFloor,
  parseDesign,
  validPlot,
  type Floor,
  type Room,
} from "../src/model";
const room = (patch: Partial<Room> = {}): Room => ({
  id: "r1",
  name: "Kitchen",
  kind: "kitchen",
  x: 1,
  y: 3,
  w: 8,
  h: 8,
  ...patch,
});
const floor = (rooms: Room[]): Floor => ({ rooms, walls: [], openings: [] });
test("half-inch wall dimensions are displayed without rounding to whole inches", () => {
  assert.equal(formatFeet(0.375), "0′ 4.5″");
  assert.equal(formatFeet(3 + 11.5 / 12), "3′ 11.5″");
});
test("initial plot preserves all four supplied boundary lengths and exposes area discrepancy", () => {
  const p = initialPlot();
  [15, 43.5, 15, 45].forEach((len, i) =>
    assert.ok(Math.abs(distance(p[i], p[(i + 1) % 4]) - len) < 1e-9),
  );
  assert.ok(validPlot(p));
  assert.ok(Math.abs(area(p) - 663.75) > 0.1);
  assert.ok(area(p) > 660);
});
test("road facing NE is screen down; North is not screen up; bearing updates direction", () => {
  const d = createDesign(),
    b = bounds(d.plot),
    x = (b.minX + b.maxX) / 2,
    y = (b.minY + b.maxY) / 2;
  assert.equal(direction(d, { x, y: y + 10 }), "NE");
  assert.equal(direction(d, { x, y: y - 10 }), "SW");
  // East is 51° clockwise from the downward road vector, towards screen left.
  assert.equal(
    direction(d, {
      x: x - 10 * Math.sin((51 * Math.PI) / 180),
      y: y + 10 * Math.cos((51 * Math.PI) / 180),
    }),
    "E",
  );
  assert.equal(direction({ ...d, bearing: 0 }, { x, y: y + 10 }), "N");
});
test("detects room overlaps and out-of-plot rooms and walls", () => {
  const d = createDesign(),
    f = floor([room(), room({ id: "r2", x: 5 }), room({ id: "r3", x: -3 })]);
  f.walls.push(room({ id: "wall", kind: "wall", x: 20, w: 0.375 }));
  const found = issues(d, f);
  assert.ok(found.some((i) => i.message.includes("overlaps")));
  assert.ok(
    found.some((i) => i.ids.includes("r3") && i.message.includes("outside")),
  );
  assert.ok(
    found.some((i) => i.ids.includes("wall") && i.message.includes("outside")),
  );
});
test("footprint union counts overlap once, clips outside footprint and deducts wall interior", () => {
  const d = createDesign(),
    f = floor([
      room({ x: 1, y: 5, w: 8, h: 8 }),
      room({ id: "r2", x: 5, y: 5, w: 8, h: 8 }),
    ]);
  const m = metrics(d, f);
  assert.equal(m.occupied, 96);
  assert.equal(m.inside, 96);
  assert.equal(m.usable, 2 * 7.25 ** 2);
  assert.ok(Math.abs(m.unassigned + m.inside - m.plot) < 1e-8);
});
test("all four layouts differ, fit same plot, and serialize independently", () => {
  const d = createDesign();
  const shapes = Array.from({ length: 4 }, (_, i) => layout(i));
  assert.equal(
    new Set(
      shapes.map((f) =>
        JSON.stringify(
          f.rooms.map(({ kind, x, y, w, h }) => ({ kind, x, y, w, h })),
        ),
      ),
    ).size,
    4,
  );
  for (const f of shapes)
    assert.deepEqual(
      issues(d, f).filter((i) => i.level === "error"),
      [],
    );
  const restored = parseDesign(JSON.stringify(d));
  restored.floors[1].rooms.push(room());
  assert.equal(d.floors[1].rooms.length, 0);
  assert.equal(restored.floors[0].rooms.length, d.floors[0].rooms.length);
});
test("import rejects malformed geometry, invalid references, non-finite sizes and duplicate IDs", () => {
  const d = createDesign();
  assert.throws(() => parseDesign("{}"));
  assert.throws(() =>
    parseDesign(
      JSON.stringify({
        ...d,
        plot: [
          { x: 0, y: 0 },
          { x: 10, y: 10 },
          { x: 0, y: 10 },
          { x: 10, y: 0 },
        ],
      }),
    ),
  );
  const bad = structuredClone(d);
  bad.floors[0].openings[0].owner = "missing";
  assert.throws(() => parseDesign(JSON.stringify(bad)));
  const dup = structuredClone(d);
  dup.floors[1].rooms.push(dup.floors[0].rooms[0]);
  assert.throws(() => parseDesign(JSON.stringify(dup)));
  const size = structuredClone(d);
  size.floors[0].rooms[0].w = Infinity;
  assert.throws(() => parseDesign(JSON.stringify(size)));
});
test("resizing clamps openings and deleting owner removes openings", () => {
  const d = createDesign(),
    f = d.floors[0],
    owner = f.rooms[0];
  owner.w = 1;
  const next = normalizeFloor(f),
    door = next.openings.find((o) => o.owner === owner.id)!;
  assert.equal(door.width, 1);
  assert.equal(door.offset, 0);
  const deleted = normalizeFloor({
    ...next,
    rooms: next.rooms.filter((r) => r.id !== owner.id),
  });
  assert.ok(!deleted.openings.some((o) => o.owner === owner.id));
});
test("door graph marks inaccessible rooms and links shared edges", () => {
  const d = createDesign(),
    f = floor([
      room({ x: 0, y: 3, w: 5, h: 5 }),
      room({ id: "r2", x: 5, y: 3, w: 5, h: 5 }),
    ]);
  assert.equal(issues(d, f).filter((i) => i.level === "warning").length, 2);
  f.openings.push(
    {
      id: "door1",
      kind: "door",
      owner: "r1",
      edge: "left",
      offset: 1,
      width: 3,
      flip: false,
    },
    {
      id: "door2",
      kind: "door",
      owner: "r1",
      edge: "right",
      offset: 1,
      width: 3,
      flip: false,
    },
  );
  assert.equal(issues(d, f).filter((i) => i.level === "warning").length, 0);
});
