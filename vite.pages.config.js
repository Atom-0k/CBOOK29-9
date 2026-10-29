import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/CBOOK29-9/",
  build: {
    outDir: "dist-pages",
    emptyOutDir: true,
  },
});
