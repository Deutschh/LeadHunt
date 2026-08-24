import axios from "axios";
import { API_BASE_URL } from "../config/apiConfig.js";

function publicBriefingPath(publicToken, suffix = "") {
  return `/public/briefings/${encodeURIComponent(publicToken || "")}${suffix}`;
}

export function createPublicBriefingApi({
  axiosModule = axios,
  baseURL = API_BASE_URL,
} = {}) {
  const transport = axiosModule.create({
    baseURL,
    withCredentials: false,
    timeout: 10_000,
    allowAbsoluteUrls: false,
  });

  return Object.freeze({
    get(publicToken, options = {}) {
      return transport.get(publicBriefingPath(publicToken), {
        signal: options.signal,
      });
    },
    submit(publicToken, payload, options = {}) {
      return transport.post(publicBriefingPath(publicToken, "/submit"), payload, {
        signal: options.signal,
      });
    },
  });
}

const publicBriefingApi = createPublicBriefingApi();

export function getPublicBriefing(publicToken, options) {
  return publicBriefingApi.get(publicToken, options);
}

export function submitPublicBriefing(publicToken, payload, options) {
  return publicBriefingApi.submit(publicToken, payload, options);
}
