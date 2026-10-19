import { useCallback, useEffect, useRef, useState } from 'react';

type Result<T> = { key: string; data?: T; error?: Error };

/**
 * Runs `load` whenever `key` changes. `loading` is derived (the stored result belongs to an older
 * key) so no state is set synchronously inside the effect.
 */
export function useAsync<T>(key: string, load: () => Promise<T>) {
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState<Result<T> | null>(null);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  const fullKey = `${key}#${nonce}`;

  useEffect(() => {
    let cancelled = false;
    loadRef
      .current()
      .then((data) => !cancelled && setResult({ key: fullKey, data }))
      .catch((e: unknown) => !cancelled && setResult({ key: fullKey, error: e instanceof Error ? e : new Error(String(e)) }));
    return () => {
      cancelled = true;
    };
  }, [fullKey]);

  const current = result?.key === fullKey ? result : null;
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data: current?.data, error: current?.error, loading: current === null, reload };
}

export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}
