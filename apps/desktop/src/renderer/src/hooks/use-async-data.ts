import { useEffect, useState } from "react";

export type AsyncStatus = "idle" | "loading" | "success" | "error";

export interface AsyncData<T> {
  data: T | null;
  status: AsyncStatus;
  error: string | null;
}

/**
 * Busca de dado assincrono generica - evita repetir o boilerplate de
 * loading/erro em cada tela que consome a API real. `fn` retornando
 * `undefined` (em vez de uma Promise) pula a busca e mantem o estado
 * "idle" - usado quando a tela ainda nao tem o que precisa pra buscar
 * (ex.: sem conta Riot vinculada ainda).
 */
export function useAsyncData<T>(fn: () => Promise<T> | undefined, deps: unknown[]): AsyncData<T> {
  const [state, setState] = useState<AsyncData<T>>({ data: null, status: "idle", error: null });

  useEffect(() => {
    const promise = fn();
    if (!promise) {
      setState({ data: null, status: "idle", error: null });
      return;
    }

    let cancelled = false;
    setState((current) => ({ data: current.data, status: "loading", error: null }));

    promise
      .then((data) => {
        if (!cancelled) setState({ data, status: "success", error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({ data: null, status: "error", error: error instanceof Error ? error.message : "Erro desconhecido." });
        }
      });

    return () => {
      cancelled = true;
    };
  }, deps);

  return state;
}
