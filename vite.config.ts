import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import fs from "fs";
import path from "path";

// Auto-stamp the service worker cache version on every build
// so stale SWs are always evicted without manual CACHE_VERSION bumps.
function swVersionPlugin(): Plugin {
  return {
    name: "sw-version-stamp",
    closeBundle() {
      const swSrc = path.resolve(__dirname, "public/sw.js");
      const swDst = path.resolve(__dirname, "dist/sw.js");
      const version = Date.now();
      // Only stamp dist copy — never mutate source file (causes dirty git state in CI)
        const target = swDst;
      if (fs.existsSync(target)) {
        let sw = fs.readFileSync(target, "utf-8");
        sw = sw.replace(/const CACHE_VERSION = \d+[^;]*;/, `const CACHE_VERSION = ${version};`);
        fs.writeFileSync(target, sw);
      }
    },
  };
}

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? "/",
  plugins: [react(), tailwindcss(), swVersionPlugin()],
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __GIT_SHA__: JSON.stringify(process.env.GITHUB_SHA?.slice(0, 7) ?? "dev"),
  },
});

