function createCompatibleError(error) {
  const message =
    typeof error?.message === "string" && error.message.length > 0
      ? error.message
      : "Não foi possível concluir a operação.";
  const compatible = new Error(message);
  compatible.name = "OperationalApiError";
  compatible.status = Number.isInteger(error?.status) ? error.status : 0;
  compatible.code =
    typeof error?.code === "string" ? error.code : "OPERATION_FAILED";
  compatible.fieldErrors = error?.fieldErrors;
  compatible.retryable = error?.retryable === true;
  compatible.response = Object.freeze({
    status: compatible.status,
    data: Object.freeze({
      error: message,
      code: compatible.code,
      ...(compatible.fieldErrors
        ? { fieldErrors: compatible.fieldErrors }
        : {}),
    }),
  });
  return compatible;
}

export function createOperationalApi(apiRequest) {
  if (typeof apiRequest !== "function") {
    throw new TypeError("apiRequest é obrigatório.");
  }

  async function request(method, path, data, options = {}) {
    try {
      const responseData = await apiRequest(path, {
        method,
        data,
        signal: options.signal,
      });
      return Object.freeze({ data: responseData });
    } catch (error) {
      throw createCompatibleError(error);
    }
  }

  return Object.freeze({
    get(path, options) {
      return request("GET", path, undefined, options);
    },
    post(path, data, options) {
      return request("POST", path, data, options);
    },
    patch(path, data, options) {
      return request("PATCH", path, data, options);
    },
    delete(path, options) {
      return request("DELETE", path, undefined, options);
    },
  });
}
