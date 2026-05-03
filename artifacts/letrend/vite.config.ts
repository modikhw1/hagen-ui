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

const REACT_CJS_FILE_RE =
  /react[\\/]cjs[\\/]react\.(development|production)(\.min)?\.js$/;

const useEffectEventPolyfillSource = `
;if (typeof exports !== 'undefined' && !exports.useEffectEvent) {
  exports.useEffectEvent = function useEffectEvent(fn) {
    var ref = exports.useRef(fn);
    exports.useInsertionEffect(function () { ref.current = fn; });
    return exports.useCallback(function () {
      return ref.current.apply(this, arguments);
    }, []);
  };
}
;if (typeof exports !== 'undefined' && !exports.Activity) {
  // Polyfill for React 19.2 <Activity mode="visible|hidden"> used by
  // Mantine v9 Transition. In React 19.1 we fall back to a plain
  // conditional render: visible (or undefined mode) → render children,
  // hidden → render nothing. We keep children mounted when visible so
  // state is preserved for the typical Mantine "keepMounted" path.
  exports.Activity = function Activity(props) {
    if (props && props.mode === 'hidden') return null;
    return props ? props.children : null;
  };
}
`;

// Rollup transform plugin so production builds also get the polyfill
// (esbuild prebundle only runs in dev).
const reactUseEffectEventPolyfillRollupPlugin = {
  name: "react-use-effect-event-polyfill-rollup",
  transform(code: string, id: string) {
    if (!REACT_CJS_FILE_RE.test(id)) return null;
    return { code: code + useEffectEventPolyfillSource, map: null };
  },
};

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    reactUseEffectEventPolyfillRollupPlugin,
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
          name: "react-use-effect-event-polyfill",
          setup(build) {
            // React 19 does not export useEffectEvent publicly, but
            // Mantine v9 calls it. Inject a polyfill into React's CJS
            // bundle so that __toESM() snapshots include the function
            // before Mantine loads. The same patch is applied at
            // production build time by the rollup plugin above.
            build.onLoad({ filter: REACT_CJS_FILE_RE }, (args) => {
              const source = readFileSync(args.path, "utf8");
              return {
                contents: source + useEffectEventPolyfillSource,
                loader: "js",
              };
            });
          },
        },
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
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
