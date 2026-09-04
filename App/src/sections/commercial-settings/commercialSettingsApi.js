export async function getCommercialProfile(api, options = {}) {
  const response = await api.get("/commercial-profile", options);
  return response.data;
}

export async function patchCommercialProfile(api, payload) {
  const response = await api.patch("/commercial-profile", payload);
  return response.data;
}

export async function getServices(api, options = {}) {
  const response = await api.get("/services", options);
  return response.data.services;
}

export async function postService(api, payload) {
  const response = await api.post("/services", payload);
  return response.data;
}

export async function patchService(api, serviceId, payload) {
  const response = await api.patch(`/services/${serviceId}`, payload);
  return response.data;
}

export async function getNicheStrategies(api, options = {}) {
  const response = await api.get("/leads/niches", options);
  return response.data;
}

export async function postNicheStrategy(api, payload) {
  const response = await api.post("/leads/niches", payload);
  return response.data;
}

export async function deleteNicheStrategy(api, strategyId) {
  const response = await api.delete(`/leads/niches/${strategyId}`);
  return response.data;
}

