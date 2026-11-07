import { createDesign, parseDesign, type Design } from "./model";
export const AUTOSAVE = "housedesign.autosave.v1",
  LIBRARY = "housedesign.library.v1";
export type Saved = { id: string; date: string; design: Design };
export function readInitial() {
  try {
    const raw = localStorage.getItem(AUTOSAVE);
    return raw
      ? { design: parseDesign(raw), warning: "" }
      : { design: createDesign(), warning: "" };
  } catch {
    return {
      design: createDesign(),
      warning:
        "Saved data could not be read. A new plan is open; export it before closing if storage is unavailable.",
    };
  }
}
export function readLibrary(): Saved[] {
  const value: unknown = JSON.parse(localStorage.getItem(LIBRARY) || "[]");
  if (!Array.isArray(value))
    throw new Error("Saved design library is invalid.");
  return value.map((v) => {
    if (!v || typeof v.id !== "string" || typeof v.date !== "string")
      throw new Error("Saved library contains an invalid entry.");
    return {
      id: v.id,
      date: v.date,
      design: parseDesign(JSON.stringify(v.design)),
    };
  });
}
