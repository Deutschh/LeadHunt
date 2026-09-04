import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteNicheStrategy,
  getCommercialProfile,
  getNicheStrategies,
  getServices,
  patchCommercialProfile,
  patchService,
  postNicheStrategy,
  postService,
} from "./commercialSettingsApi.js";
import { sortServices, sortStrategies } from "./commercialSettingsModel.js";

function initialResource(data) {
  return { data, loading: true, error: null };
}

function publicErrorMessage(error, fallback) {
  return typeof error?.message === "string" && error.message.trim()
    ? error.message
    : fallback;
}

export default function useCommercialSettings(api) {
  const mountedRef = useRef(true);
  const [profile, setProfile] = useState(() => initialResource(null));
  const [services, setServices] = useState(() => initialResource([]));
  const [strategies, setStrategies] = useState(() => initialResource([]));
  const [profileSaving, setProfileSaving] = useState(false);
  const [serviceSaving, setServiceSaving] = useState(false);
  const [strategySaving, setStrategySaving] = useState(false);

  const loadProfile = useCallback(
    async (options = {}) => {
      setProfile((current) => ({ ...current, loading: true, error: null }));
      try {
        const data = await getCommercialProfile(api, options);
        if (mountedRef.current) setProfile({ data, loading: false, error: null });
      } catch (error) {
        if (options.signal?.aborted || error?.code === "REQUEST_ABORTED") return;
        if (mountedRef.current) {
          setProfile((current) => ({
            ...current,
            loading: false,
            error: publicErrorMessage(
              error,
              "Não foi possível carregar o perfil comercial.",
            ),
          }));
        }
      }
    },
    [api],
  );

  const loadServices = useCallback(
    async (options = {}) => {
      setServices((current) => ({ ...current, loading: true, error: null }));
      try {
        const data = await getServices(api, options);
        if (mountedRef.current) {
          setServices({ data: sortServices(data), loading: false, error: null });
        }
      } catch (error) {
        if (options.signal?.aborted || error?.code === "REQUEST_ABORTED") return;
        if (mountedRef.current) {
          setServices((current) => ({
            ...current,
            loading: false,
            error: publicErrorMessage(
              error,
              "Não foi possível carregar produtos e serviços.",
            ),
          }));
        }
      }
    },
    [api],
  );

  const loadStrategies = useCallback(
    async (options = {}) => {
      setStrategies((current) => ({ ...current, loading: true, error: null }));
      try {
        const data = await getNicheStrategies(api, options);
        if (mountedRef.current) {
          setStrategies({
            data: sortStrategies(data),
            loading: false,
            error: null,
          });
        }
      } catch (error) {
        if (options.signal?.aborted || error?.code === "REQUEST_ABORTED") return;
        if (mountedRef.current) {
          setStrategies((current) => ({
            ...current,
            loading: false,
            error: publicErrorMessage(
              error,
              "Não foi possível carregar as estratégias de nicho.",
            ),
          }));
        }
      }
    },
    [api],
  );

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();
    void Promise.allSettled([
      loadProfile({ signal: controller.signal }),
      loadServices({ signal: controller.signal }),
      loadStrategies({ signal: controller.signal }),
    ]);
    return () => {
      mountedRef.current = false;
      controller.abort();
    };
  }, [loadProfile, loadServices, loadStrategies]);

  const updateProfile = useCallback(
    async (payload) => {
      setProfileSaving(true);
      try {
        const data = await patchCommercialProfile(api, payload);
        if (mountedRef.current) {
          setProfile({ data, loading: false, error: null });
        }
        return data;
      } finally {
        if (mountedRef.current) setProfileSaving(false);
      }
    },
    [api],
  );

  const createService = useCallback(
    async (payload) => {
      setServiceSaving(true);
      try {
        const created = await postService(api, payload);
        if (mountedRef.current) {
          setServices((current) => ({
            data: sortServices([...current.data, created]),
            loading: false,
            error: null,
          }));
        }
        return created;
      } finally {
        if (mountedRef.current) setServiceSaving(false);
      }
    },
    [api],
  );

  const updateService = useCallback(
    async (serviceId, payload) => {
      setServiceSaving(true);
      try {
        const updated = await patchService(api, serviceId, payload);
        if (mountedRef.current) {
          setServices((current) => ({
            data: sortServices(
              current.data.map((item) =>
                item.id === updated.id ? updated : item,
              ),
            ),
            loading: false,
            error: null,
          }));
        }
        return updated;
      } finally {
        if (mountedRef.current) setServiceSaving(false);
      }
    },
    [api],
  );

  const upsertStrategy = useCallback(
    async (payload) => {
      setStrategySaving(true);
      try {
        const updated = await postNicheStrategy(api, payload);
        if (mountedRef.current) {
          setStrategies((current) => {
            const withoutCurrent = current.data.filter(
              (item) =>
                item.id !== updated.id &&
                item.nicheName !== updated.nicheName,
            );
            return {
              data: sortStrategies([...withoutCurrent, updated]),
              loading: false,
              error: null,
            };
          });
        }
        return updated;
      } finally {
        if (mountedRef.current) setStrategySaving(false);
      }
    },
    [api],
  );

  const removeStrategy = useCallback(
    async (strategyId) => {
      setStrategySaving(true);
      try {
        await deleteNicheStrategy(api, strategyId);
        if (mountedRef.current) {
          setStrategies((current) => ({
            data: current.data.filter((item) => item.id !== strategyId),
            loading: false,
            error: null,
          }));
        }
      } finally {
        if (mountedRef.current) setStrategySaving(false);
      }
    },
    [api],
  );

  return {
    profile,
    services,
    strategies,
    profileSaving,
    serviceSaving,
    strategySaving,
    loadProfile,
    loadServices,
    loadStrategies,
    updateProfile,
    createService,
    updateService,
    upsertStrategy,
    removeStrategy,
  };
}

