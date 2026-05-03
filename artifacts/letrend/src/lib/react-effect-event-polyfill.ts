// React 19.1 does not export `useEffectEvent`, but Mantine v9 calls
// `React.useEffectEvent` from inside Transition. The reliable fix is to
// patch React's CJS bundle (which is what Mantine sees through __toESM
// / require) BEFORE Mantine ever imports it.
//
// We do not mutate the ESM namespace object here, because module
// namespace objects are non-extensible when the property is missing
// (assigning would throw "Cannot add property useEffectEvent, object is
// not extensible"). Instead we patch the CJS exports object, which is
// the actual source of truth that __toESM copies from.
//
// The patch happens at build time:
//   - dev:   via the `optimizeDeps.esbuildOptions` plugin in vite.config
//   - build: via the `react-use-effect-event-polyfill` rollup plugin in
//            vite.config (transform hook on react.{development,
//            production}{.min}?.js)
//
// This file remains as a no-op marker that is imported first from
// main.tsx so anyone reading the entry point sees the cross-reference
// to vite.config.

export {};
