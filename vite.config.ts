import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import fs from "fs";
import path from "path";

// Auto-stamp the service worker cache version on every build
function swVersionPlugin(): Plugin {
  return {
    name: "sw-version-stamp",
    closeBundle() {
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
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      thresholds: {
        lines: 40,
        branches: 30,
      },
    },
  },
  build: {
    // Hidden source maps: .map files deployed but no //# sourceMappingURL in JS.
    // Fixes Lighthouse Best Practices "missing source maps" without exposing them to users.
    sourcemap: "hidden",
    rollupOptions: {
      output: {
        // Manual chunk splitting — vendor libs cached separately from app code.
        // Modals are already split via React.lazy; this handles the remaining vendors.
        manualChunks(id) {
          // Vendor chunks — long-cache TTL (content-hashed)
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) return "vendor-react";
          if (id.includes("node_modules/qrcode.react")) return "vendor-qr";
          if (id.includes("node_modules/dompurify")) return "vendor-dompurify";
          // App engine chunks — separate from UI components
          if (id.includes("/src/engine/") || id.includes("/src/parser/")) return "app-engine";
          if (id.includes("/src/context/") || id.includes("/src/store/")) return "app-context";
          if (id.includes("/src/utils/")) return "app-utils";
        },
      },
    },
  },
});
