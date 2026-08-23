import { useCallback, useEffect, useState } from "react";
import { createAuthHttpClient } from "./authHttpClient.js";
import { normalizePublicConfig } from "./authUiModel.js";

const publicClient = createAuthHttpClient();

export function usePublicAuthConfig() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ status: "loading", config: null });

  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    publicClient
      .getPublicConfig({ signal: controller.signal })
      .then((payload) => {
        if (current) setState({ status: "ready", config: normalizePublicConfig(payload) });
      })
      .catch(() => {
        if (current) setState({ status: "unavailable", config: null });
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setState({ status: "loading", config: null });
    setAttempt((value) => value + 1);
  }, []);
  return { ...state, retry };
}
