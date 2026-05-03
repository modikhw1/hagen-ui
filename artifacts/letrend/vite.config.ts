import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { readFileSync } from "fs";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  optimizeDeps: {
    esbuildOptions: {
      plugins: [
        {
          name: 'react-use-effect-event-polyfill',
          setup(build) {
            // React 19 does not export useEffectEvent publicly, but Mantine v9
            // calls it. Inject a polyfill into React's CJS bundle so that
            // __toESM() snapshots include the function before Mantine loads.
            build.onLoad(
              { filter: /react[\\/]cjs[\\/]react\.(development|production\.min)\.js$/ },
              (args) => {
                const source = readFileSync(args.path, 'utf8');
                const polyfill = `
if (!exports.useEffectEvent) {
  exports.useEffectEvent = function useEffectEvent(fn) {
    var ref = exports.useRef(fn);
    exports.useInsertionEffect(function() { ref.current = fn; });
    return exports.useCallback(function() {
      return ref.current.apply(this, arguments);
    }, []);
  };
}`;
                return { contents: source + polyfill, loader: 'js' };
              }
            );
          },
        },
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
      "stripe": path.resolve(import.meta.dirname, "src/stubs/stripe.ts"),
      "next/cache": path.resolve(import.meta.dirname, "src/stubs/next-cache.ts"),
      "next/server": path.resolve(import.meta.dirname, "src/stubs/next-server.ts"),
      "next/navigation": path.resolve(import.meta.dirname, "src/stubs/next-navigation.ts"),
      "next/headers": path.resolve(import.meta.dirname, "src/stubs/next-headers.ts"),
      "next/image": path.resolve(import.meta.dirname, "src/stubs/next-image.tsx"),
      "server-only": path.resolve(import.meta.dirname, "src/stubs/server-only.ts"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
