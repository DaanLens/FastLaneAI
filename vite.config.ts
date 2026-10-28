import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// GitHub Pages: https://daanlens.github.io/FastLaneAI/
export default defineConfig({
  base: "/FastLaneAI/",
  plugins: [react(), tailwindcss()],
});
