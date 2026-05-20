import api from "./api.js";

export async function updatePromptStatus(promptAngle, status) {
  const encodedAngle = encodeURIComponent(promptAngle);

  const response = await api.patch(
    `/leads/prompt-configs/${encodedAngle}/status`,
    { status },
  );

  return response.data;
}