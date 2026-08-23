import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { createAuthHttpClient } from "./authHttpClient.js";
import { createAuthSessionController } from "./authSessionController.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [controller] = useState(() =>
    createAuthSessionController({ client: createAuthHttpClient() }),
  );
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  useEffect(() => {
    void controller.start();
    return () => controller.dispose();
  }, [controller]);

  const value = useMemo(
    () => ({
      ...snapshot,
      apiRequest: controller.apiRequest,
      login: controller.login,
      logout: controller.logout,
      reloadMe: controller.reloadMe,
      retryBootstrap: controller.retryBootstrap,
    }),
    [controller, snapshot],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// React Fast Refresh accepts this stable hook alongside the provider components.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth deve ser usado dentro de AuthProvider.");
  }
  return context;
}

export function AuthBootstrapBoundary({ children }) {
  const auth = useAuth();

  if (auth.status === "bootstrapping") {
    return (
      <div role="status" aria-live="polite">
        Carregando sessão...
      </div>
    );
  }

  if (auth.status === "unavailable") {
    return (
      <div role="alert">
        <p>Não foi possível carregar a sessão.</p>
        <button type="button" onClick={() => void auth.retryBootstrap()}>
          Tentar novamente
        </button>
      </div>
    );
  }

  return children;
}
