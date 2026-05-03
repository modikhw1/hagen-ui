import * as React from 'react';

const ReactNS = React as unknown as Record<string, unknown>;

if (typeof ReactNS.useEffectEvent !== 'function') {
  ReactNS.useEffectEvent = function useEffectEvent<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => TResult,
  ): (...args: TArgs) => TResult {
    const ref = React.useRef(fn);
    React.useInsertionEffect(() => {
      ref.current = fn;
    });
    return React.useCallback((...args: TArgs) => ref.current(...args), []);
  };
}
