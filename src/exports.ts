import { bounds, type Design } from "./model";
export function download(data: Blob, name: string) {
  const url = URL.createObjectURL(data),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export async function exportPlan(
  svg: SVGSVGElement,
  d: Design,
  floor: number,
  type: "png" | "pdf",
) {
  const copy = svg.cloneNode(true) as SVGSVGElement,
    b = bounds(d.plot),
    w = b.maxX - b.minX + 12,
    h = b.maxY - b.minY + 15;
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  copy.setAttribute("viewBox", `${b.minX - 6} ${b.minY - 6} ${w} ${h}`);
  copy.setAttribute("width", "1200");
  copy.setAttribute("height", String(Math.round((1200 * h) / w)));
  copy.querySelectorAll("[data-editor]").forEach((e) => e.remove());
  const ns = "http://www.w3.org/2000/svg";
  const caption = (x: number, y: number, value: string, size = ".55") => {
    const text = document.createElementNS(ns, "text");
    text.setAttribute("x", String(x));
    text.setAttribute("y", String(y));
    text.setAttribute("font-size", size);
    text.setAttribute("font-family", "sans-serif");
    text.setAttribute("fill", "#344d40");
    text.textContent = value;
    copy.appendChild(text);
  };
  caption(b.minX, b.minY - 3.5, d.name.slice(0, 50), ".75");
  caption(
    b.minX,
    b.minY - 2.4,
    floor ? "First floor (future)" : "Ground floor",
  );
  caption(
    b.minX,
    b.maxY + 7.5,
    "Concept only · Not for construction · 1 grid square = 1 ft",
    ".45",
  );
  const north = document.createElementNS(ns, "g");
  const edgeAngle =
    (Math.atan2(d.plot[2].y - d.plot[3].y, d.plot[2].x - d.plot[3].x) * 180) /
    Math.PI;
  north.setAttribute(
    "transform",
    `translate(${b.maxX + 3} ${b.minY + 3}) rotate(${180 + edgeAngle - d.bearing})`,
  );
  const arrow = document.createElementNS(ns, "path");
  arrow.setAttribute("d", "M0,-1.8L-.45,-.6H-.1V1.3H.1V-.6H.45Z");
  arrow.setAttribute("fill", "#245e4e");
  north.appendChild(arrow);
  copy.appendChild(north);
  caption(b.maxX + 2.7, b.minY + 6, "N");
  const xml = new XMLSerializer().serializeToString(copy),
    url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = Math.round((1200 * h) / w);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#faf9f5";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    const filename =
      d.name.replace(/[^a-z0-9-]/gi, "_") + (floor ? "-first" : "-ground");
    if (type === "png") {
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((v) =>
          v ? resolve(v) : reject(new Error("PNG export failed.")),
        ),
      );
      download(blob, filename + ".png");
    } else {
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ unit: "mm", format: "a4" });
      pdf.setFontSize(15);
      pdf.text(d.name.slice(0, 60), 12, 15);
      pdf.setFontSize(9);
      pdf.text(
        `${floor ? "First floor (future)" : "Ground floor"} | Concept only. Not for construction.`,
        12,
        22,
      );
      const ratio = Math.min(186 / canvas.width, 252 / canvas.height);
      pdf.addImage(
        canvas.toDataURL("image/png"),
        "PNG",
        (210 - canvas.width * ratio) / 2,
        28,
        canvas.width * ratio,
        canvas.height * ratio,
      );
      pdf.save(filename + ".pdf");
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}
