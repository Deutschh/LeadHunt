export async function getPreviews(api) {
  const res = await api.get("/previews");
  return res.data;
}

export async function createPreview(api, data) {
  const res = await api.post("/previews", data);
  return res.data;
}
