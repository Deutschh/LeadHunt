import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider.jsx";
import { getAccountDestination, getInternalLocation } from "../auth/authFlow.js";
import { AuthStatusScreen } from "../components/auth/AuthComponents.jsx";
import { useAdmin } from "./AdminProvider.jsx";
import { resolveAdminRoute } from "./adminRouteModel.js";

export default function AdminRouteBoundary() {
  const auth = useAuth();
  const admin = useAdmin();
  const location = useLocation();
  const decision = resolveAdminRoute(auth.status, admin.accessStatus);

  if (decision === "login") {
    return (
      <Navigate
        to="/login"
        replace
        state={{ returnTo: getInternalLocation(location) }}
      />
    );
  }
  if (decision === "checking") return <AuthStatusScreen />;
  if (decision === "deny") {
    return <Navigate to={getAccountDestination(auth)} replace />;
  }
  if (decision === "error") {
    return <AuthStatusScreen unavailable onRetry={admin.retryAccess} />;
  }
  return <Outlet />;
}
