import api from "./api";

export async function getPreviews() {
  const res = await api.get("/previews");
  return res.data;
}

export async function createPreview(data) {
  const res = await api.post("/previews", data);
  return res.data;
}
