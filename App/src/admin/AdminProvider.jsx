import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { useAuth } from "../auth/AuthProvider.jsx";
import { createAdminApi } from "./adminApi.js";
import { createAdminController } from "./adminController.js";

const AdminContext = createContext(null);

export function AdminProvider({ children }) {
  const auth = useAuth();
  const [controller] = useState(() =>
    createAdminController({ api: createAdminApi(auth.apiRequest) }),
  );
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  useEffect(() => {
    if (auth.status === "authenticated") {
      void controller.startSession(auth.sessionVersion).catch(() => undefined);
    } else {
      controller.endSession();
    }
  }, [auth.sessionVersion, auth.status, controller]);

  useEffect(() => () => controller.endSession(), [controller]);

  const value = useMemo(
    () => ({
      ...snapshot,
      activateWorkspace: controller.activateWorkspace,
      loadWorkspaceAudit: controller.loadWorkspaceAudit,
      loadWorkspaceDetails: controller.loadWorkspaceDetails,
      loadWorkspaces: controller.loadWorkspaces,
      reactivateWorkspace: controller.reactivateWorkspace,
      retryAccess: controller.retryAccess,
      selectWorkspace: controller.selectWorkspace,
      suspendWorkspace: controller.suspendWorkspace,
      updateMaxProfiles: controller.updateMaxProfiles,
      updateReleaseChannel: controller.updateReleaseChannel,
    }),
    [controller, snapshot],
  );

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

// React Fast Refresh accepts this stable hook alongside the provider component.
// eslint-disable-next-line react-refresh/only-export-components
export function useAdmin() {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error("useAdmin deve ser usado dentro de AdminProvider.");
  }
  return context;
}
