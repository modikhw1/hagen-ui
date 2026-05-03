import React, { useRef, useInsertionEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Mantine v9 calls React.useEffectEvent which is not part of React's public API.
// Polyfill it so Mantine's Modal/Popover components don't crash.
type AnyFn = (...args: unknown[]) => unknown;
if (!(React as Record<string, unknown>)["useEffectEvent"]) {
  (React as Record<string, unknown>)["useEffectEvent"] = <T extends AnyFn>(fn: T): T => {
    const ref = useRef(fn);
    useInsertionEffect(() => { ref.current = fn; });
    return useCallback(function (this: unknown, ...args: Parameters<T>): ReturnType<T> {
      return ref.current.apply(this, args) as ReturnType<T>;
    }, []) as unknown as T;
  };
}

createRoot(document.getElementById("root")!).render(<App />);
