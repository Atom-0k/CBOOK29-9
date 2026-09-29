import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/static/cuaderno/react/",
  build: {
    outDir: "../static/cuaderno/react",
    emptyOutDir: true,
    manifest: true,
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8000",
      "/login": "http://127.0.0.1:8000",
      "/logout": "http://127.0.0.1:8000",
      "/dashboard": "http://127.0.0.1:8000",
      "/static/cuaderno/vendor": "http://127.0.0.1:8000",
    },
  },
});
