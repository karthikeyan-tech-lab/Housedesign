import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// Relative assets work at Vercel's domain root and GitHub Pages' repo subpath.
export default defineConfig({ plugins: [react()], base: "./" });
