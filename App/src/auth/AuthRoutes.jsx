import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider.jsx";
import { getAccountDestination, getInternalLocation, sanitizeReturnTo } from "./authFlow.js";
import { AuthStatusScreen } from "../components/auth/AuthComponents.jsx";
import AccountStatePage from "../pages/auth/AccountStatePage.jsx";
import ForgotPasswordPage from "../pages/auth/ForgotPasswordPage.jsx";
import LoginPage from "../pages/auth/LoginPage.jsx";
import RegisterPage from "../pages/auth/RegisterPage.jsx";
import ResetPasswordPage from "../pages/auth/ResetPasswordPage.jsx";
import VerifyEmailPage from "../pages/auth/VerifyEmailPage.jsx";

function SessionBoundary({ children }) {
  const auth = useAuth();
  if (auth.status === "bootstrapping") return <AuthStatusScreen />;
  if (auth.status === "unavailable") return <AuthStatusScreen unavailable />;
  return children;
}

function PublicOnlyRoute({ children }) {
  const auth = useAuth();
  if (auth.status === "authenticated") return <Navigate to={getAccountDestination(auth)} replace />;
  return children;
}

function AccountStateRoute({ state }) {
  const auth = useAuth();
  if (auth.status !== "authenticated") return <Navigate to="/login" replace />;
  const destination = getAccountDestination(auth);
  if (destination !== `/${state}`) return <Navigate to={destination} replace />;
  return <AccountStatePage state={state} />;
}

function OperationalRoute({ children }) {
  const auth = useAuth(); const location = useLocation();
  if (auth.status !== "authenticated") {
    return <Navigate to="/login" replace state={{ returnTo: getInternalLocation(location) }} />;
  }
  const destination = getAccountDestination(auth, sanitizeReturnTo(location.state?.returnTo));
  if (destination !== "/") return <Navigate to={destination} replace />;
  return children;
}

export default function AuthRoutes({ operationalElement }) {
  return <SessionBoundary><Routes>
    <Route path="/login" element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} />
    <Route path="/register" element={<PublicOnlyRoute><RegisterPage /></PublicOnlyRoute>} />
    <Route path="/verify-email" element={<PublicOnlyRoute><VerifyEmailPage /></PublicOnlyRoute>} />
    <Route path="/forgot-password" element={<PublicOnlyRoute><ForgotPasswordPage /></PublicOnlyRoute>} />
    <Route path="/reset-password" element={<ResetPasswordPage />} />
    <Route path="/pending" element={<AccountStateRoute state="pending" />} />
    <Route path="/suspended" element={<AccountStateRoute state="suspended" />} />
    <Route path="/inactive" element={<AccountStateRoute state="inactive" />} />
    <Route path="*" element={<OperationalRoute>{operationalElement}</OperationalRoute>} />
  </Routes></SessionBoundary>;
}
