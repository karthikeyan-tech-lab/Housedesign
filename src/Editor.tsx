import { useEffect, useRef, useState, type RefObject } from "react";
import {
  bounds,
  color,
  formatFeet,
  openingPoint,
  type Design,
  type Edge,
  type Floor,
  type Opening,
  type Point,
  type Room,
} from "./model";
type View = { x: number; y: number; w: number; h: number };
type Props = {
  design: Design;
  floor: number;
  selected: string;
  onSelect: (id: string) => void;
  onChange: (f: Floor) => void;
  onBegin: () => void;
  svgRef: RefObject<SVGSVGElement | null>;
  fitKey: number;
  pan: boolean;
  bad: Set<string>;
  warning: Set<string>;
  onAdd: (kind: string, p: Point) => void;
};
const snap = (v: number) => Math.round(v * 12) / 12;
export default function Editor({
  design,
  floor,
  selected,
  onSelect,
  onChange,
  onBegin,
  svgRef,
  fitKey,
  pan,
  bad,
  warning,
  onAdd,
}: Props) {
  const b = bounds(design.plot),
    fit = {
      x: b.minX - 4,
      y: b.minY - 4,
      w: b.maxX - b.minX + 8,
      h: b.maxY - b.minY + 10,
    };
  const [camera, setCamera] = useState<{ key: number; view: View }>({
    key: -1,
    view: fit,
  });
  const view = camera.key === fitKey ? camera.view : fit;
  const [pixels, setPixels] = useState({ w: 400, h: 500 });
  useEffect(() => {
    const node = svgRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([e]) =>
      setPixels({ w: e.contentRect.width, h: e.contentRect.height }),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [svgRef]);
  const hitSize =
    44 *
    Math.max(view.w / Math.max(1, pixels.w), view.h / Math.max(1, pixels.h));
  const frontDx = design.plot[2].x - design.plot[3].x;
  const frontDy = design.plot[2].y - design.plot[3].y;
  const frontLength = Math.hypot(frontDx, frontDy);
  const frontAngle = (Math.atan2(frontDy, frontDx) * 180) / Math.PI;
  const setView = (v: View) => setCamera({ key: fitKey, view: v });
  const f = design.floors[floor],
    pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{
    type: "move" | "resize" | "pan" | "pinch" | "opening";
    start: Point;
    view: View;
    object?: Room;
    opening?: Opening;
    base: Floor;
    begun?: boolean;
    distance?: number;
    center?: Point;
  } | null>(null);
  const toPlan = (client: Point): Point => {
    const svg = svgRef.current!,
      pt = svg.createSVGPoint();
    pt.x = client.x;
    pt.y = client.y;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: p.x, y: p.y };
  };
  const localPoint = (e: React.PointerEvent) => ({
    x: e.clientX,
    y: e.clientY,
  });
  function start(e: React.PointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = localPoint(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        type: "pinch",
        start: toPlan({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }),
        view,
        base: f,
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
      return;
    }
    const target = e.target as Element,
      id = target.closest("[data-id]")?.getAttribute("data-id");
    const obj = [...f.rooms, ...f.walls].find((r) => r.id === id),
      opening = f.openings.find((o) => o.id === id);
    if (id && !pan) onSelect(id);
    if (obj && !pan) {
      gesture.current = {
        type: target.hasAttribute("data-resize") ? "resize" : "move",
        start: toPlan(p),
        object: { ...obj },
        view,
        base: f,
      };
    } else if (opening && !pan) {
      gesture.current = {
        type: "opening",
        start: toPlan(p),
        opening,
        view,
        base: f,
      };
    } else {
      if (!pan) onSelect("");
      gesture.current = { type: "pan", start: p, view, base: f };
    }
  }
  function move(e: React.PointerEvent<SVGSVGElement>) {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, localPoint(e));
    const g = gesture.current;
    if (g.type === "pinch" && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()],
        dist = Math.hypot(a.x - b.x, a.y - b.y),
        scale = Math.max(
          2 / g.view.w,
          Math.min(4000 / g.view.w, g.distance! / Math.max(1, dist)),
        );
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        rect = svgRef.current!.getBoundingClientRect(),
        unit = Math.min(rect.width / g.view.w, rect.height / g.view.h);
      setView({
        x:
          g.start.x -
          (g.start.x - g.view.x) * scale -
          ((center.x - g.center!.x) / unit) * scale,
        y:
          g.start.y -
          (g.start.y - g.view.y) * scale -
          ((center.y - g.center!.y) / unit) * scale,
        w: g.view.w * scale,
        h: g.view.h * scale,
      });
      return;
    }
    if (g.type === "pan") {
      const rect = svgRef.current!.getBoundingClientRect(),
        unit = Math.min(rect.width / g.view.w, rect.height / g.view.h);
      setView({
        ...g.view,
        x: g.view.x - (e.clientX - g.start.x) / unit,
        y: g.view.y - (e.clientY - g.start.y) / unit,
      });
      return;
    }
    const p = toPlan(localPoint(e));
    if (!g.begun) {
      if (Math.hypot(p.x - g.start.x, p.y - g.start.y) < 0.04) return;
      onBegin();
      g.begun = true;
    }
    if (g.type === "opening") {
      const o = g.opening!,
        r = [...f.rooms, ...f.walls].find((r) => r.id === o.owner)!;
      const edge = (
        [
          ["top", Math.abs(p.y - r.y)],
          ["bottom", Math.abs(p.y - r.y - r.h)],
          ["left", Math.abs(p.x - r.x)],
          ["right", Math.abs(p.x - r.x - r.w)],
        ] as [Edge, number][]
      ).sort((a, b) => a[1] - b[1])[0][0];
      const len = ["top", "bottom"].includes(edge) ? r.w : r.h,
        width = Math.min(o.width, len),
        along = ["top", "bottom"].includes(edge) ? p.x - r.x : p.y - r.y;
      onChange({
        ...f,
        openings: f.openings.map((v) =>
          v.id === o.id
            ? {
                ...v,
                edge,
                width,
                offset: Math.max(
                  0,
                  Math.min(len - width, snap(along - width / 2)),
                ),
              }
            : v,
        ),
      });
      return;
    }
    const r = g.object!,
      dx = p.x - g.start.x,
      dy = p.y - g.start.y;
    const next =
      g.type === "resize"
        ? {
            ...r,
            w: Math.max(0.5, Math.min(200, snap(r.w + dx))),
            h: Math.max(0.5, Math.min(200, snap(r.h + dy))),
          }
        : {
            ...r,
            x: Math.max(-1000, Math.min(1000, snap(r.x + dx))),
            y: Math.max(-1000, Math.min(1000, snap(r.y + dy))),
          };
    onChange({
      ...f,
      rooms: f.rooms.map((v) => (v.id === r.id ? next : v)),
      walls: f.walls.map((v) => (v.id === r.id ? next : v)),
    });
  }
  function end(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2 && gesture.current?.type === "pinch")
      gesture.current = null;
    if (!pointers.current.size) gesture.current = null;
  }
  const zoom = (requested: number) => {
    const factor = Math.max(2, Math.min(4000, view.w * requested)) / view.w;
    setView({
      x: view.x + (view.w * (1 - factor)) / 2,
      y: view.y + (view.h * (1 - factor)) / 2,
      w: view.w * factor,
      h: view.h * factor,
    });
  };
  function renderRoom(r: Room, ghost = false) {
    const active = selected === r.id && !ghost,
      wall = r.kind === "wall",
      stroke =
        bad.has(r.id) && !ghost
          ? "#bd513f"
          : active
            ? "#1b7864"
            : warning.has(r.id) && !ghost
              ? "#b28735"
              : "#555f56";
    return (
      <g
        key={r.id}
        data-id={ghost ? undefined : r.id}
        opacity={ghost ? 0.22 : 1}
        style={{ cursor: pan ? "grab" : "move" }}
      >
        <rect
          x={r.x}
          y={r.y}
          width={r.w}
          height={r.h}
          fill={wall ? "#697369" : color(r.kind)}
          stroke={stroke}
          strokeWidth={active ? 0.13 : 0.06}
          strokeDasharray={ghost ? ".3 .15" : undefined}
        />
        {!wall && (
          <>
            <rect
              x={r.x + design.wall / 2}
              y={r.y + design.wall / 2}
              width={Math.max(0, r.w - design.wall)}
              height={Math.max(0, r.h - design.wall)}
              fill="none"
              stroke={stroke}
              strokeWidth={design.wall}
              opacity=".35"
              pointerEvents="none"
            />
            {r.kind === "staircase" &&
              Array.from({ length: 12 }, (_, i) => (
                <path
                  key={i}
                  d={
                    r.w > r.h
                      ? `M${r.x + 0.4 + ((r.w - 0.8) * i) / 12},${r.y + 0.4}v${r.h - 0.8}`
                      : `M${r.x + 0.4},${r.y + 0.4 + ((r.h - 0.8) * i) / 12}h${r.w - 0.8}`
                  }
                  stroke="#8a9286"
                  strokeWidth=".06"
                  pointerEvents="none"
                />
              ))}
            <text
              x={r.x + r.w / 2}
              y={r.y + r.h / 2 - 0.4}
              textAnchor="middle"
              fontSize={Math.min(0.6, (r.w / Math.max(r.name.length, 6)) * 1.5)}
              fill="#293c34"
              fontWeight="600"
              pointerEvents="none"
            >
              {r.name}
            </text>
            <text
              x={r.x + r.w / 2}
              y={r.y + r.h / 2 + 0.45}
              textAnchor="middle"
              fontSize=".43"
              fill="#526359"
              pointerEvents="none"
            >
              {formatFeet(r.w)} × {formatFeet(r.h)}
            </text>
            <text
              x={r.x + r.w / 2}
              y={r.y + r.h / 2 + 1.12}
              textAnchor="middle"
              fontSize=".42"
              fill="#526359"
              pointerEvents="none"
            >
              {(r.w * r.h).toFixed(1)} sq ft
            </text>
          </>
        )}
        {active && (
          <g data-editor="true">
            <rect
              data-resize="true"
              x={r.x + r.w - hitSize / 2}
              y={r.y + r.h - hitSize / 2}
              width={hitSize}
              height={hitSize}
              fill="transparent"
            />
            <rect
              data-resize="true"
              x={r.x + r.w - 0.85}
              y={r.y + r.h - 0.85}
              width="1.7"
              height="1.7"
              rx=".35"
              fill="#1b7864"
              stroke="white"
              strokeWidth=".1"
            />
            <path
              d={`M${r.x + r.w - 0.35},${r.y + r.h + 0.35}l.7,-.7`}
              stroke="white"
              strokeWidth=".1"
              pointerEvents="none"
            />
          </g>
        )}
      </g>
    );
  }
  function renderOpening(o: Opening) {
    const r = [...f.rooms, ...f.walls].find((v) => v.id === o.owner);
    if (!r) return null;
    const p = openingPoint(r, o),
      angle = { top: 0, right: 90, bottom: 180, left: 270 }[o.edge],
      width = o.width;
    return (
      <g
        key={o.id}
        data-id={o.id}
        transform={`translate(${p.x} ${p.y}) rotate(${angle})`}
        style={{ cursor: "move" }}
      >
        <path
          d={`M${-width / 2},0h${width}`}
          stroke={
            bad.has(o.id)
              ? "#bd513f"
              : o.id === selected
                ? "#1b7864"
                : "#faf9f5"
          }
          strokeWidth={design.wall + 0.12}
        />
        {o.kind === "window" ? (
          <>
            <path
              d={`M${-width / 2},-.13h${width}m${-width},.26h${width}`}
              fill="none"
              stroke="#467d93"
              strokeWidth=".08"
            />
          </>
        ) : (
          <g transform={o.flip ? "scale(-1,-1)" : undefined}>
            <path
              d={`M${-width / 2},0v${width}M${-width / 2},${width}A${width},${width} 0 0 0 ${width / 2},0`}
              stroke="#557969"
              strokeWidth=".07"
              fill="none"
            />
          </g>
        )}
        <rect
          x={-width / 2}
          y="-.55"
          width={width}
          height="1.1"
          fill="transparent"
          stroke={o.id === selected ? "#1b7864" : "none"}
          strokeWidth=".08"
          data-editor="true"
        />
      </g>
    );
  }
  return (
    <div className="drawing-wrap">
      <svg
        ref={svgRef}
        className="drawing"
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onWheel={(e) => {
          const factor = e.deltaY > 0 ? 1.08 : 0.92;
          zoom(factor);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const kind = e.dataTransfer.getData("text/housedesign-room");
          if (kind) onAdd(kind, toPlan({ x: e.clientX, y: e.clientY }));
        }}
        aria-label="Interactive floor plan. Drag rooms to move. Drag the green corner to resize."
      >
        <defs>
          <pattern id="grid" width="1" height="1" patternUnits="userSpaceOnUse">
            <path
              d="M 1 0 L 0 0 0 1"
              fill="none"
              stroke="#d8ddd3"
              strokeWidth=".025"
            />
          </pattern>
          <pattern
            id="major"
            width="5"
            height="5"
            patternUnits="userSpaceOnUse"
          >
            <rect width="5" height="5" fill="url(#grid)" />
            <path
              d="M 5 0 L 0 0 0 5"
              fill="none"
              stroke="#c8cec3"
              strokeWidth=".045"
            />
          </pattern>
        </defs>
        <rect
          x={view.x}
          y={view.y}
          width={view.w}
          height={view.h}
          fill="#faf9f5"
          data-editor="true"
        />
        <polygon
          points={design.plot.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="url(#major)"
          stroke="#647264"
          strokeWidth=".13"
          strokeDasharray=".4 .18"
        />
        {floor === 1 && (
          <g pointerEvents="none">
            {[...design.floors[0].rooms, ...design.floors[0].walls].map((r) =>
              renderRoom(r, true),
            )}
          </g>
        )}
        {f.rooms.map((r) => renderRoom(r))}
        {f.walls.map((r) => renderRoom(r))}
        {f.openings.map(renderOpening)}
        {design.plot.map((p, i) => {
          const next = design.plot[(i + 1) % 4];
          const vertical = i % 2 === 1;
          return (
            <text
              key={i}
              x={(p.x + next.x) / 2 + (vertical ? (i === 1 ? 1.5 : -1.5) : 0)}
              y={(p.y + next.y) / 2 + (vertical ? 0 : i === 0 ? -1 : 1.5)}
              textAnchor="middle"
              fontSize=".65"
              fill="#607164"
              transform={
                vertical
                  ? `rotate(-90 ${(p.x + next.x) / 2 + (i === 1 ? 1.5 : -1.5)} ${(p.y + next.y) / 2})`
                  : undefined
              }
            >
              {formatFeet(Math.hypot(next.x - p.x, next.y - p.y))}
            </text>
          );
        })}
        <g
          transform={`translate(${(design.plot[2].x + design.plot[3].x) / 2 - (frontDy / frontLength) * 3.5},${(design.plot[2].y + design.plot[3].y) / 2 + (frontDx / frontLength) * 3.5}) rotate(${frontAngle})`}
        >
          <path d="M-8,0H8" stroke="#d1cabc" strokeWidth="1.5" />
          <path
            d="M-8,0H8"
            stroke="#faf9f5"
            strokeWidth=".06"
            strokeDasharray=".6 .5"
          />
          <text y="1.65" textAnchor="middle" fontSize=".6" fill="#7b7a6a">
            FRONT ROAD · {design.bearing}°
          </text>
        </g>
      </svg>
      <div className="zoom-tools" data-editor>
        <button onClick={() => zoom(0.8)} aria-label="Zoom in">
          +
        </button>
        <button onClick={() => zoom(1.25)} aria-label="Zoom out">
          −
        </button>
        <button onClick={() => setView(fit)} aria-label="Fit plot">
          Fit
        </button>
      </div>
      <span className="scale-note">1 square = 1 ft · snap 1 inch</span>
    </div>
  );
}
