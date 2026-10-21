import {
  normalizePasswordPayload,
  normalizePasswordResponse,
  normalizeProfilePayload,
  normalizeProfileResponse,
} from "./accountModel.js";

export function createAccountApi(apiRequest) {
  if (typeof apiRequest !== "function") {
    throw new TypeError("apiRequest é obrigatório.");
  }

  async function updateProfile(payload, options = {}) {
    const data = normalizeProfilePayload(payload);
    return normalizeProfileResponse(
      await apiRequest("/account/profile", {
        method: "PATCH",
        data,
        signal: options.signal,
      }),
    );
  }

  async function changePassword(payload, options = {}) {
    const data = normalizePasswordPayload(payload);
    return normalizePasswordResponse(
      await apiRequest("/account/password", {
        method: "PATCH",
        data,
        signal: options.signal,
      }),
    );
  }

  return Object.freeze({ changePassword, updateProfile });
}
