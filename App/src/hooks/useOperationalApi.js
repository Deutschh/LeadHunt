import { useMemo } from "react";
import { useAuth } from "../auth/AuthProvider.jsx";
import { createOperationalApi } from "../services/api.js";

export default function useOperationalApi() {
  const { apiRequest } = useAuth();
  return useMemo(() => createOperationalApi(apiRequest), [apiRequest]);
}
