import { useEffect, useRef, useState } from "react";
import Editor from "./Editor";
import {
  area,
  bearingName,
  bounds,
  color,
  createDesign,
  direction,
  distance,
  formatFeet,
  issues,
  layout,
  metrics,
  normalizeFloor,
  parseDesign,
  templates,
  uid,
  validPlot,
  vastu,
  type Design,
  type Edge,
  type Floor,
  type Opening,
  type Point,
  type Room,
} from "./model";
import {
  AUTOSAVE,
  LIBRARY,
  readInitial,
  readLibrary,
  type Saved,
} from "./storage";
import { download, exportPlan } from "./exports";

type Tab = "rooms" | "edit" | "plot" | "checks" | "designs";
function Measure({
  label,
  value,
  onChange,
  min = 0,
  max = 200,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  const total = Math.round(value * 24) / 2,
    ft = Math.floor(total / 12),
    inch = total % 12;
  return (
    <fieldset className="measure">
      <legend>{label}</legend>
      <label>
        <input
          aria-label={`${label} feet`}
          type="number"
          inputMode="decimal"
          min={Math.floor(min)}
          max={max}
          value={ft}
          onChange={(e) => {
            const n = Number(e.target.value) + inch / 12;
            if (n >= min && n <= max) onChange(n);
          }}
        />
        <span>ft</span>
      </label>
      <label>
        <input
          aria-label={`${label} inches`}
          type="number"
          inputMode="decimal"
          min="0"
          max="11.5"
          step="0.5"
          value={inch}
          onChange={(e) => {
            const n = ft + Number(e.target.value) / 12;
            if (
              +e.target.value >= 0 &&
              +e.target.value <= 11.5 &&
              n >= min &&
              n <= max
            )
              onChange(n);
          }}
        />
        <span>in</span>
      </label>
    </fieldset>
  );
}
function Numeric({
  label,
  value,
  onChange,
  min = -1000,
  max = 1000,
  step = 0.0833333333,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="field">
      {label}
      <input
        type="number"
        inputMode="decimal"
        value={Number(value.toFixed(4))}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          if (e.target.value === "") return;
          const n = Number(e.target.value);
          if (Number.isFinite(n) && n >= min && n <= max) onChange(n);
        }}
      />
    </label>
  );
}
export default function App() {
  const [initial] = useState(readInitial),
    [design, setDesign] = useState<Design>(initial.design),
    [floor, setFloor] = useState(0),
    [selected, select] = useState(""),
    [tab, setTab] = useState<Tab>("rooms");
  const [past, setPast] = useState<Design[]>([]),
    [future, setFuture] = useState<Design[]>([]),
    [fitKey, setFit] = useState(0),
    [pan, setPan] = useState(false),
    [vastuMode, setVastu] = useState(false),
    [status, setStatus] = useState(
      initial.warning || "All changes saved on this device",
    ),
    [storageError, setStorageError] = useState(false),
    [saved, setSaved] = useState<Saved[]>([]),
    [layoutChoice, setLayoutChoice] = useState("0"),
    [help, setHelp] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null),
    importRef = useRef<HTMLInputElement>(null),
    current = useRef(design);
  current.current = design;
  const f = design.floors[floor],
    obj = [...f.rooms, ...f.walls].find((r) => r.id === selected),
    opening = f.openings.find((o) => o.id === selected),
    checks = issues(design, f),
    m = metrics(design, f),
    bad = new Set(
      checks.filter((i) => i.level === "error").flatMap((i) => i.ids),
    );
  useEffect(() => {
    try {
      setSaved(readLibrary());
    } catch {
      setStatus(
        "Saved design library could not be read. Import a backup to recover a design.",
      );
      setStorageError(true);
    }
  }, []);
  useEffect(() => {
    const timeout = setTimeout(() => {
      try {
        localStorage.setItem(AUTOSAVE, JSON.stringify(design));
        setStorageError(false);
        setStatus("All changes saved on this device");
      } catch {
        setStorageError(true);
        setStatus(
          "Local saving unavailable or full. Export JSON to keep your design.",
        );
      }
    }, 350);
    return () => clearTimeout(timeout);
  }, [design]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      try {
        localStorage.setItem(AUTOSAVE, JSON.stringify(current.current));
      } catch {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  const begin = () => {
    setPast((p) => [...p.slice(-59), current.current]);
    setFuture([]);
  };
  function commit(next: Design) {
    begin();
    setDesign(next);
  }
  function changeFloor(next: Floor, history = true) {
    const d = {
      ...current.current,
      floors: current.current.floors.map((v, i) =>
        i === floor ? normalizeFloor(next) : v,
      ) as [Floor, Floor],
    };
    if (history) commit(d);
    else setDesign(d);
  }
  function updateObject(patch: Partial<Room>) {
    if (!obj) return;
    changeFloor({
      ...f,
      rooms: f.rooms.map((r) => (r.id === obj.id ? { ...r, ...patch } : r)),
      walls: f.walls.map((r) => (r.id === obj.id ? { ...r, ...patch } : r)),
    });
  }
  function updateOpening(patch: Partial<Opening>) {
    changeFloor({
      ...f,
      openings: f.openings.map((o) =>
        o.id === selected ? { ...o, ...patch } : o,
      ),
    });
  }
  function undo() {
    if (!past.length) return;
    setFuture((v) => [design, ...v]);
    setDesign(past[past.length - 1]);
    setPast((p) => p.slice(0, -1));
    select("");
  }
  function redo() {
    if (!future.length) return;
    setPast((p) => [...p, design]);
    setDesign(future[0]);
    setFuture((v) => v.slice(1));
    select("");
  }
  function add(kind: string, at?: Point) {
    const t = templates.find((t) => t.kind === kind);
    if (!t) return;
    const b = bounds(design.plot),
      r: Room = {
        id: uid(),
        kind,
        name: t.name,
        x: Math.round((at ? at.x - t.w / 2 : b.minX + 0.5) * 12) / 12,
        y: Math.round((at ? at.y - t.h / 2 : b.minY + 2) * 12) / 12,
        w: t.w,
        h: t.h,
      };
    changeFloor({ ...f, rooms: [...f.rooms, r] });
    select(r.id);
    setTab("edit");
  }
  function addWall() {
    const r: Room = {
      id: uid(),
      kind: "wall",
      name: "Internal wall",
      x: 1,
      y: 21,
      w: 8,
      h: design.wall,
    };
    changeFloor({ ...f, walls: [...f.walls, r] });
    select(r.id);
    setTab("edit");
  }
  function addOpening(kind: "door" | "window") {
    if (!obj) {
      setStatus("Select a room or wall first.");
      return;
    }
    const o: Opening = {
      id: uid(),
      kind,
      owner: obj.id,
      edge: "bottom",
      offset: Math.max(0, (obj.w - 3) / 2),
      width: Math.min(3, obj.w),
      flip: false,
    };
    changeFloor({ ...f, openings: [...f.openings, o] });
    select(o.id);
  }
  function remove() {
    changeFloor({
      ...f,
      rooms: f.rooms.filter((r) => r.id !== selected),
      walls: f.walls.filter((r) => r.id !== selected),
      openings: f.openings.filter(
        (o) => o.id !== selected && o.owner !== selected,
      ),
    });
    select("");
  }
  function saveNamed(duplicate = false) {
    try {
      const entry: Saved = {
        id: uid(),
        date: new Date().toISOString(),
        design: { ...design, name: design.name + (duplicate ? " (copy)" : "") },
      };
      const next = [...readLibrary(), entry];
      localStorage.setItem(LIBRARY, JSON.stringify(next));
      setSaved(next);
      setStatus(
        duplicate ? "A named copy was saved." : "Named snapshot saved.",
      );
    } catch {
      setStorageError(true);
      setStatus("Could not save to this device. Export JSON instead.");
    }
  }
  function switchDesign(next: Design) {
    commit(next);
    select("");
    setFloor(0);
    setFit((v) => v + 1);
  }
  async function runExport(type: "png" | "pdf") {
    try {
      await exportPlan(svgRef.current!, design, floor, type);
      setStatus(`${type.toUpperCase()} export created for the current floor.`);
    } catch (e) {
      setStatus(`Export failed: ${(e as Error).message}`);
    }
  }
  const frontAngle =
    (Math.atan2(
      design.plot[2].y - design.plot[3].y,
      design.plot[2].x - design.plot[3].x,
    ) *
      180) /
    Math.PI;
  const northAngle = 180 + frontAngle - design.bearing;
  const openingOwner =
    opening && [...f.rooms, ...f.walls].find((r) => r.id === opening.owner);
  return (
    <div className="app">
      <header className="topbar">
        <a href="#" className="brand" aria-label="HouseDesign home">
          <span className="brand-icon">⌂</span>
          <span>
            House<span className="brand-light">Design</span>
            <small>MAKE ROOM FOR YOUR LIFE</small>
          </span>
        </a>
        <div className="top-actions">
          <span className={`save-status ${storageError ? "error" : ""}`}>
            <i />
            {storageError ? "Export a backup" : "Saved on device"}
          </span>
          <button
            className="quiet"
            onClick={() => setHelp(true)}
            aria-label="How to use"
          >
            ?
          </button>
          <button className="primary" onClick={() => setTab("designs")}>
            Save & export <span>→</span>
          </button>
        </div>
      </header>
      <div className="workspace-heading">
        <div>
          <div className="eyebrow">YOUR PERSONAL FLOOR PLANNER</div>
          <h1>Small plot. Big possibilities.</h1>
          <p>A home that fits your land, and the way you live.</p>
        </div>
        <div className="plot-summary">
          <b>
            {m.plot.toFixed(2)} <small>sq ft</small>
          </b>
          <span>
            Calculated plot · {bearingName(design.bearing)} {design.bearing}°
            frontage
          </span>
        </div>
      </div>
      <main className="workspace">
        <aside className="panel">
          <nav className="tabs" aria-label="Editor tools">
            {(
              [
                ["rooms", "＋", "Add"],
                ["edit", "☷", "Edit"],
                ["plot", "◇", "Plot"],
                ["checks", "✓", "Checks"],
                ["designs", "▤", "Designs"],
              ] as const
            ).map(([key, icon, label]) => (
              <button
                key={key}
                className={tab === key ? "active" : ""}
                onClick={() => setTab(key)}
              >
                <span>{icon}</span>
                {label}
                {key === "checks" && checks.length > 0 && (
                  <sup>{checks.length}</sup>
                )}
              </button>
            ))}
          </nav>
          <div className="panel-content">
            {tab === "rooms" && (
              <>
                <div className="section-heading">
                  <h2>Build your space</h2>
                  <span>01 / PLAN</span>
                </div>
                <p className="muted">
                  Tap a room to add it, then drag it into place. Every dimension
                  is yours to change.
                </p>
                <div className="room-library">
                  {templates.map((t, i) => (
                    <button
                      key={t.kind}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/housedesign-room", t.kind);
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      onClick={() => add(t.kind)}
                    >
                      <span
                        className="room-symbol"
                        style={{ background: t.color }}
                      >
                        {
                          [
                            "▱",
                            "▣",
                            "▥",
                            "✧",
                            "◫",
                            "◧",
                            "▦",
                            "▤",
                            "☷",
                            "⌂",
                            "↔",
                          ][i]
                        }
                      </span>
                      <span>
                        <b>{t.name}</b>
                        <small>
                          {t.w} × {t.h} ft
                        </small>
                      </span>
                      <em>+</em>
                    </button>
                  ))}
                </div>
                <button className="wide outline" onClick={addWall}>
                  ＋ Internal wall
                </button>
                <div className="tip">
                  <b>Start with a little inspiration</b>
                  <p>Four editable layouts, all on your plot.</p>
                  <label className="field">
                    Starting layout
                    <select
                      value={layoutChoice}
                      onChange={(e) => setLayoutChoice(e.target.value)}
                    >
                      <option value="0">A · Compact & budget-friendly</option>
                      <option value="1">B · Larger hall</option>
                      <option value="2">C · Separate dining</option>
                      <option value="3">D · Open kitchen</option>
                    </select>
                  </label>
                  <button
                    className="wide outline"
                    onClick={() => {
                      changeFloor(layout(Number(layoutChoice)));
                      select("");
                      setStatus(
                        "Starting layout applied to this floor. Undo restores your previous layout.",
                      );
                    }}
                  >
                    Apply to this floor
                  </button>
                  <small>Replaces this floor. Undo is available.</small>
                </div>
              </>
            )}
            {tab === "edit" && (
              <>
                <div className="section-heading">
                  <h2>
                    {obj
                      ? "Make it yours"
                      : opening
                        ? `Edit ${opening.kind}`
                        : "Select a space"}
                  </h2>
                  <span>02 / REFINE</span>
                </div>
                {!obj && !opening && (
                  <div className="empty">
                    <span>⌖</span>
                    <p>
                      Tap a room, wall, door or window on the plan to edit it.
                    </p>
                    <button className="outline" onClick={() => setTab("rooms")}>
                      Add a room
                    </button>
                  </div>
                )}
                {obj && (
                  <>
                    <label className="field">
                      Name
                      <input
                        value={obj.name}
                        maxLength={120}
                        onChange={(e) =>
                          updateObject({ name: e.target.value || "Room" })
                        }
                      />
                    </label>
                    <div className="area-chip">
                      {(obj.w * obj.h).toFixed(1)} sq ft footprint{" "}
                      <span>
                        {Math.max(0, obj.w - 2 * design.wall).toFixed(2)} ×{" "}
                        {Math.max(0, obj.h - 2 * design.wall).toFixed(2)} ft
                        clear
                      </span>
                    </div>
                    <Measure
                      label="Width"
                      value={obj.w}
                      min={0.05}
                      onChange={(w) => updateObject({ w })}
                    />
                    <Measure
                      label="Depth"
                      value={obj.h}
                      min={0.05}
                      onChange={(h) => updateObject({ h })}
                    />
                    <div className="two-col">
                      <Numeric
                        label="X position (ft)"
                        value={obj.x}
                        onChange={(x) => updateObject({ x })}
                      />
                      <Numeric
                        label="Y position (ft)"
                        value={obj.y}
                        onChange={(y) => updateObject({ y })}
                      />
                    </div>
                    <p className="fine">
                      Dimensions include wall thickness. Positions use plot
                      coordinates, not compass directions.
                    </p>
                    <div className="nudge" aria-label="Move selected object">
                      <button
                        aria-label="Move up 6 inches"
                        onClick={() => updateObject({ y: obj.y - 0.5 })}
                      >
                        ↑
                      </button>
                      <button
                        aria-label="Move left 6 inches"
                        onClick={() => updateObject({ x: obj.x - 0.5 })}
                      >
                        ←
                      </button>
                      <span>Move 6″</span>
                      <button
                        aria-label="Move right 6 inches"
                        onClick={() => updateObject({ x: obj.x + 0.5 })}
                      >
                        →
                      </button>
                      <button
                        aria-label="Move down 6 inches"
                        onClick={() => updateObject({ y: obj.y + 0.5 })}
                      >
                        ↓
                      </button>
                    </div>
                    <button
                      className="wide outline"
                      onClick={() => {
                        const edges: Record<Edge, Edge> = {
                          top: "right",
                          right: "bottom",
                          bottom: "left",
                          left: "top",
                        };
                        changeFloor({
                          ...f,
                          rooms: f.rooms.map((r) =>
                            r.id === obj.id ? { ...r, w: r.h, h: r.w } : r,
                          ),
                          walls: f.walls.map((r) =>
                            r.id === obj.id ? { ...r, w: r.h, h: r.w } : r,
                          ),
                          openings: f.openings.map((o) =>
                            o.owner === obj.id
                              ? {
                                  ...o,
                                  edge: edges[o.edge],
                                  offset: ["left", "right"].includes(o.edge)
                                    ? Math.max(0, obj.h - o.offset - o.width)
                                    : o.offset,
                                }
                              : o,
                          ),
                        });
                      }}
                    >
                      ↻ Rotate 90°
                    </button>
                    <div className="two-col">
                      <button
                        className="outline"
                        onClick={() => addOpening("door")}
                      >
                        ＋ Door
                      </button>
                      <button
                        className="outline"
                        onClick={() => addOpening("window")}
                      >
                        ＋ Window
                      </button>
                    </div>
                    {f.openings
                      .filter((o) => o.owner === obj.id)
                      .map((o) => (
                        <button
                          className="opening-link"
                          key={o.id}
                          onClick={() => select(o.id)}
                        >
                          {o.kind === "door" ? "↳" : "▭"} {o.kind} · {o.edge} ·{" "}
                          {formatFeet(o.width)} <span>✎</span>
                        </button>
                      ))}
                    {vastuMode && (
                      <p className="tip">
                        {vastu(design, obj) ||
                          "No traditional zone preference for this space."}
                      </p>
                    )}
                  </>
                )}
                {opening && openingOwner && (
                  <>
                    <p className="muted">
                      On {openingOwner.name}. Drag the opening along or around
                      its owner’s edges.
                    </p>
                    <label className="field">
                      Wall edge
                      <select
                        value={opening.edge}
                        onChange={(e) =>
                          updateOpening({ edge: e.target.value as Edge })
                        }
                      >
                        {["top", "right", "bottom", "left"].map((e) => (
                          <option key={e}>{e}</option>
                        ))}
                      </select>
                    </label>
                    <Measure
                      label="Opening width"
                      value={opening.width}
                      min={0.1}
                      max={
                        ["top", "bottom"].includes(opening.edge)
                          ? openingOwner.w
                          : openingOwner.h
                      }
                      onChange={(width) => updateOpening({ width })}
                    />
                    <Measure
                      label="Offset from edge start"
                      value={opening.offset}
                      max={Math.max(
                        0,
                        (["top", "bottom"].includes(opening.edge)
                          ? openingOwner.w
                          : openingOwner.h) - opening.width,
                      )}
                      onChange={(offset) => updateOpening({ offset })}
                    />
                    {opening.kind === "door" && (
                      <button
                        className="wide outline"
                        onClick={() => updateOpening({ flip: !opening.flip })}
                      >
                        ↔ Reverse door swing
                      </button>
                    )}
                    <button
                      className="wide outline"
                      onClick={() => select(opening.owner)}
                    >
                      Select owner room / wall
                    </button>
                  </>
                )}
                {(obj || opening) && (
                  <button className="wide danger" onClick={remove}>
                    Delete{" "}
                    {opening?.kind || (obj?.kind === "wall" ? "wall" : "room")}
                  </button>
                )}
                <h3>Spaces on this floor</h3>
                <div className="object-list">
                  {[...f.rooms, ...f.walls].map((r) => (
                    <button
                      key={r.id}
                      className={r.id === selected ? "chosen" : ""}
                      onClick={() => select(r.id)}
                    >
                      <i style={{ background: color(r.kind) }} />
                      {r.name}
                      <small>{(r.w * r.h).toFixed(0)} ft²</small>
                    </button>
                  ))}
                </div>
              </>
            )}
            {tab === "plot" && (
              <>
                <div className="section-heading">
                  <h2>Your piece of land</h2>
                  <span>03 / SITE</span>
                </div>
                <p className="muted">
                  An irregular four-corner plot. The road runs along P4 → P3;
                  the bearing points outward toward the road.
                </p>
                <div className="notice">
                  <b>Survey before building</b>
                  <p>
                    Side lengths alone do not fix the corner angles. The
                    starting shape matches 15′ front/back, 45′ left and 43′6″
                    right, with a square front-left corner. Its area is{" "}
                    {area(createDesign().plot).toFixed(2)} ft², versus the
                    supplied 663.75 ft² reference.
                  </p>
                </div>
                <div className="plot-diagram">
                  P1 ───── P2
                  <br />│ &nbsp; REAR &nbsp; │<br />│ &nbsp; PLOT &nbsp; │<br />
                  P4 ───── P3
                  <br />
                  <b>↓ FRONT ROAD</b>
                </div>
                {design.plot.map((p, i) => (
                  <div className="vertex" key={i}>
                    <b>P{i + 1}</b>
                    <Numeric
                      label={`P${i + 1} X (ft)`}
                      value={p.x}
                      onChange={(x) => {
                        const plot = design.plot.map((v, j) =>
                          j === i ? { ...v, x } : v,
                        );
                        if (validPlot(plot)) {
                          commit({ ...design, plot });
                          setFit((v) => v + 1);
                        } else
                          setStatus(
                            "Plot must remain a convex, non-crossing quadrilateral of at least 10 sq ft.",
                          );
                      }}
                    />
                    <Numeric
                      label={`P${i + 1} Y (ft)`}
                      value={p.y}
                      onChange={(y) => {
                        const plot = design.plot.map((v, j) =>
                          j === i ? { ...v, y } : v,
                        );
                        if (validPlot(plot)) {
                          commit({ ...design, plot });
                          setFit((v) => v + 1);
                        } else
                          setStatus(
                            "Invalid corner: keep a convex, non-crossing plot.",
                          );
                      }}
                    />
                  </div>
                ))}
                <div className="edge-list">
                  {["Rear", "Right", "Front / road", "Left"].map((label, i) => (
                    <div key={label}>
                      {label}
                      <b>
                        {formatFeet(
                          distance(design.plot[i], design.plot[(i + 1) % 4]),
                        )}
                      </b>
                    </div>
                  ))}
                </div>
                <Numeric
                  label="Road-facing bearing (degrees clockwise from North)"
                  value={design.bearing}
                  min={0}
                  max={359.999}
                  step={1}
                  onChange={(bearing) => commit({ ...design, bearing })}
                />
                <Measure
                  label="Wall thickness"
                  value={design.wall}
                  min={0.05}
                  max={2}
                  onChange={(wall) =>
                    commit({
                      ...design,
                      wall,
                      floors: design.floors.map((fl) => ({
                        ...fl,
                        walls: fl.walls.map((w) =>
                          w.w < w.h ? { ...w, w: wall } : { ...w, h: wall },
                        ),
                      })) as [Floor, Floor],
                    })
                  }
                />
                <p className="fine">
                  All rooms use this thickness. Shared room boundaries are
                  schematic; wall junctions need drafting refinement. Plot
                  changes apply to both floors.
                </p>
              </>
            )}
            {tab === "checks" && (
              <>
                <div className="section-heading">
                  <h2>A more thoughtful plan</h2>
                  <span>04 / REVIEW</span>
                </div>
                <div className="check-summary">
                  <b>{checks.filter((c) => c.level === "error").length}</b>{" "}
                  geometry issues{" "}
                  <span>
                    {checks.filter((c) => c.level === "warning").length} access
                    warnings
                  </span>
                </div>
                {checks.length === 0 && (
                  <p className="tip">
                    No schematic geometry or door-route issues detected.
                  </p>
                )}
                <div className="issues">
                  {checks.map((issue, i) => (
                    <button
                      className={issue.level}
                      key={i}
                      onClick={() => {
                        select(issue.ids[0]);
                        setTab("edit");
                      }}
                    >
                      <b>{issue.level === "error" ? "!" : "↳"}</b>
                      <span>{issue.message}</span>
                    </button>
                  ))}
                </div>
                <h3>How space is used</h3>
                <dl className="area-breakdown">
                  <div>
                    <dt>Calculated plot</dt>
                    <dd>{m.plot.toFixed(2)} ft²</dd>
                  </div>
                  <div>
                    <dt>Occupied union footprint</dt>
                    <dd>{m.occupied.toFixed(2)} ft²</dd>
                  </div>
                  <div>
                    <dt>Footprint inside plot</dt>
                    <dd>{m.inside.toFixed(2)} ft²</dd>
                  </div>
                  <div>
                    <dt>Room interiors (sum)</dt>
                    <dd>{m.usable.toFixed(2)} ft²</dd>
                  </div>
                  <div>
                    <dt>Unassigned plot</dt>
                    <dd>{m.unassigned.toFixed(2)} ft²</dd>
                  </div>
                </dl>
                <p className="fine">
                  The footprint union counts overlaps only once. Interior sums
                  include overlapping rooms until you resolve them. Unassigned
                  space must accommodate circulation and applicable setbacks; it
                  is not automatically buildable.
                </p>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={vastuMode}
                    onChange={(e) => setVastu(e.target.checked)}
                  />{" "}
                  Traditional Vastu guidance
                </label>
                {vastuMode && (
                  <div className="vastu-list">
                    {f.rooms.map((r) => (
                      <p key={r.id}>{vastu(design, r)}</p>
                    ))}
                    <small>
                      Optional cultural preferences, separate from safety
                      checks. Directions use each room’s centre and the actual
                      road bearing.
                    </small>
                  </div>
                )}
                <div className="notice">
                  <b>Concept plan · not construction-ready</b>
                  <p>
                    Door-route checks are schematic: they do not certify access
                    widths, circulation, egress, ventilation, setbacks or local
                    building compliance. Internal wall obstructions and door
                    swings need manual review. A qualified local architect and
                    structural engineer must verify G+1, foundations, columns
                    and all approvals.
                  </p>
                </div>
              </>
            )}
            {tab === "designs" && (
              <>
                <div className="section-heading">
                  <h2>Keep your possibilities</h2>
                  <span>05 / SAVE</span>
                </div>
                <label className="field">
                  Design name
                  <input
                    value={design.name}
                    maxLength={120}
                    onChange={(e) =>
                      commit({
                        ...design,
                        name: e.target.value || "Untitled home",
                      })
                    }
                  />
                </label>
                <div className="two-col">
                  <button className="primary" onClick={() => saveNamed()}>
                    Save snapshot
                  </button>
                  <button className="outline" onClick={() => saveNamed(true)}>
                    Duplicate
                  </button>
                </div>
                <p className="fine">
                  Autosave keeps your working plan on this browser. Named
                  snapshots stay unchanged until loaded. Export JSON for a
                  portable backup.
                </p>
                <h3>Export your design</h3>
                <div className="export-grid">
                  <button className="outline" onClick={() => runExport("png")}>
                    ↓ PNG <small>Current floor</small>
                  </button>
                  <button className="outline" onClick={() => runExport("pdf")}>
                    ↓ PDF <small>Current floor · A4</small>
                  </button>
                  <button
                    className="outline"
                    onClick={() =>
                      download(
                        new Blob([JSON.stringify(design, null, 2)], {
                          type: "application/json",
                        }),
                        "housedesign.json",
                      )
                    }
                  >
                    ↓ JSON <small>Both floors · editable</small>
                  </button>
                  <button
                    className="outline"
                    onClick={() => importRef.current?.click()}
                  >
                    ↑ Import <small>HouseDesign JSON</small>
                  </button>
                </div>
                <input
                  hidden
                  ref={importRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    try {
                      if (file.size > 2_000_000)
                        throw new Error("Maximum file size is 2 MB.");
                      switchDesign(parseDesign(await file.text()));
                      setStatus(
                        "Design imported. Undo restores your previous plan.",
                      );
                    } catch (error) {
                      setStatus(`Import rejected: ${(error as Error).message}`);
                    }
                  }}
                />
                <h3>
                  Saved on this device{" "}
                  <span className="count">{saved.length}</span>
                </h3>
                {!saved.length && (
                  <p className="muted">Your named designs will appear here.</p>
                )}
                {saved.map((entry) => (
                  <div className="saved-design" key={entry.id}>
                    <b>{entry.design.name}</b>
                    <small>
                      {new Date(entry.date).toLocaleDateString()} ·{" "}
                      {entry.design.floors[0].rooms.length} ground-floor spaces
                    </small>
                    <div className="two-col">
                      <button
                        className="outline"
                        onClick={() =>
                          switchDesign(
                            parseDesign(JSON.stringify(entry.design)),
                          )
                        }
                      >
                        Load
                      </button>
                      <button
                        className="quiet"
                        onClick={() => {
                          try {
                            const next = saved.filter((v) => v.id !== entry.id);
                            localStorage.setItem(LIBRARY, JSON.stringify(next));
                            setSaved(next);
                          } catch {
                            setStatus("Could not remove saved snapshot.");
                          }
                        }}
                      >
                        Delete snapshot
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  className="wide outline"
                  onClick={() => switchDesign(createDesign())}
                >
                  Start a fresh design
                </button>
                <p className="fine">
                  Loading or starting fresh can be undone. Browser storage is
                  local to this device and can be cleared by the browser.
                </p>
              </>
            )}
          </div>
        </aside>
        <section className="canvas-panel" aria-label="Floor plan editor">
          <div className="canvas-toolbar">
            <div className="floor-tabs">
              <button
                className={floor === 0 ? "active" : ""}
                onClick={() => {
                  setFloor(0);
                  select("");
                }}
              >
                Ground floor
              </button>
              <button
                className={floor === 1 ? "active" : ""}
                onClick={() => {
                  setFloor(1);
                  select("");
                }}
              >
                First floor <small>FUTURE</small>
              </button>
            </div>
            <div className="edit-tools">
              <button
                onClick={undo}
                disabled={!past.length}
                aria-label="Undo"
                title="Undo"
              >
                ↶
              </button>
              <button
                onClick={redo}
                disabled={!future.length}
                aria-label="Redo"
                title="Redo"
              >
                ↷
              </button>
              <span />
              <button
                className={pan ? "active" : ""}
                onClick={() => setPan(!pan)}
                aria-label="Pan mode"
                aria-pressed={pan}
                title="Pan mode"
              >
                ✥
              </button>
              <button
                onClick={() => setFit((v) => v + 1)}
                aria-label="Fit entire plot"
                title="Fit entire plot"
              >
                ⊡
              </button>
              <button
                onClick={async () => {
                  try {
                    if (document.fullscreenElement)
                      await document.exitFullscreen();
                    else await document.documentElement.requestFullscreen();
                  } catch {
                    setStatus("Fullscreen is unavailable in this browser.");
                  }
                }}
                aria-label="Toggle fullscreen"
                title="Fullscreen"
              >
                ⛶
              </button>
            </div>
          </div>
          <div className="canvas-meta">
            <span>
              <i /> {design.name} <span className="meta-divider">/</span>{" "}
              {floor ? "First floor" : "Ground floor"}
            </span>
            <label>
              <input
                type="checkbox"
                checked={vastuMode}
                onChange={(e) => setVastu(e.target.checked)}
              />{" "}
              Vastu
            </label>
          </div>
          <div className="canvas-stage">
            <Editor
              design={design}
              floor={floor}
              selected={selected}
              onSelect={(id) => {
                select(id);
                if (id) setTab("edit");
              }}
              onChange={(next) => changeFloor(next, false)}
              onBegin={begin}
              svgRef={svgRef}
              fitKey={fitKey}
              pan={pan}
              bad={bad}
              warning={
                new Set(
                  checks
                    .filter((c) => c.level === "warning")
                    .flatMap((c) => c.ids),
                )
              }
              onAdd={add}
            />
            <div
              className="compass"
              aria-label={`North arrow. Road-facing bearing ${design.bearing} degrees. North points ${northAngle} degrees clockwise from screen up.`}
            >
              <div className="compass-dial">
                <span
                  className="north"
                  style={{ transform: `rotate(${northAngle}deg)` }}
                >
                  <b>N</b>
                  <i />
                </span>
                <span className="compass-center" />
              </div>
              <small>
                ROAD {design.bearing}° {bearingName(design.bearing)}
              </small>
            </div>
            {floor === 1 && (
              <div className="floor-reference">
                Dashed / faded: ground-floor reference
                <br />
                Add rooms for your future floor and separate entrance.
              </div>
            )}
          </div>
          <div className="canvas-footer">
            <span>
              <i className="legend-dot" /> Plot boundary
            </span>
            <span>
              Drag to move · Corner to resize · 2 fingers to pan / zoom
            </span>
            <button onClick={() => setHelp(true)}>Help →</button>
          </div>
        </section>
      </main>
      <div className="bottom-bar">
        <div className="area-meter">
          <b>
            {m.inside.toFixed(0)} <small>/ {m.plot.toFixed(0)} ft²</small>
          </b>
          <span>plot footprint</span>
          <div>
            <i
              style={{ width: `${Math.min(100, (m.inside / m.plot) * 100)}%` }}
            />
          </div>
        </div>
        <button
          className={`issue-pill ${bad.size ? "has-errors" : ""}`}
          onClick={() => setTab("checks")}
        >
          {bad.size ? "!" : "↳"} {checks.length} items to review <span>→</span>
        </button>
        <span className="concept-label">
          A place to plan. An engineer to build.
        </span>
      </div>
      <div
        role="status"
        aria-live="polite"
        className={`status-line ${storageError ? "error" : ""}`}
      >
        {status}
      </div>
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <section
            className="help-modal"
            role="dialog"
            aria-modal="true"
            aria-label="How to use HouseDesign"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close"
              autoFocus
              onClick={() => setHelp(false)}
              aria-label="Close help"
            >
              ×
            </button>
            <div className="eyebrow">A HOME IN YOUR HANDS</div>
            <h2>Start with a room.</h2>
            <p>
              Tap <b>Add</b> to choose a room. Drag it on the plan, or use{" "}
              <b>Edit</b> for exact feet and inches. The green corner resizes
              your selection. New rooms may overlap: check the red outlines and
              review the Checks tab.
            </p>
            <p>
              Use two fingers to pan and pinch to zoom. Tap <b>Fit</b> to see
              your plot again. Pan mode also lets you pan over rooms. Undo and
              redo are always in the top toolbar.
            </p>
            <p>
              Add doors and windows from a selected room. Drag them to
              reposition along its wall edges. Rotate rooms in 90° increments.
              Openings follow their owner.
            </p>
            <p>
              The frontage is at the bottom of the initial plan, facing 39° NE.
              The rotating compass shows true North; screen up is not North.
              Adjust corners and bearing in <b>Plot</b>.
            </p>
            <p>
              Switch to <b>First floor</b> for an independent future plan over a
              faded ground-floor reference. Save both floors with JSON; PNG and
              PDF export the current floor.
            </p>
            <p className="notice">
              Concept planning only. Vastu is optional. Setbacks, circulation,
              structure and G+1 suitability require local professional
              verification.
            </p>
            <button className="primary wide" onClick={() => setHelp(false)}>
              Let’s make room →
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
