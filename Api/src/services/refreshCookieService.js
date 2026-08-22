function createRefreshCookieService(config) {
  const baseOptions = Object.freeze({
    httpOnly: true,
    path: config.refreshCookiePath,
    sameSite: config.refreshCookieSameSite,
    secure: config.refreshCookieSecure,
  });

  function read(req) {
    const rawHeader = req.headers.cookie;

    if (typeof rawHeader !== "string" || rawHeader.length === 0) {
      return { status: "absent" };
    }

    const values = [];
    for (const rawPart of rawHeader.split(";")) {
      const part = rawPart.trim();
      const separator = part.indexOf("=");

      if (separator < 0 || part.slice(0, separator) !== config.refreshCookieName) {
        continue;
      }

      try {
        values.push(decodeURIComponent(part.slice(separator + 1)));
      } catch (_error) {
        return { status: "ambiguous" };
      }
    }

    if (values.length === 0) {
      return { status: "absent" };
    }

    if (values.length !== 1 || values[0].length === 0) {
      return { status: "ambiguous" };
    }

    return { status: "present", token: values[0] };
  }

  function set(res, token, expiresAt) {
    const expires = new Date(expiresAt);
    const maxAge = Math.max(0, expires.getTime() - Date.now());
    res.cookie(config.refreshCookieName, token, {
      ...baseOptions,
      expires,
      maxAge,
    });
  }

  function clear(res) {
    res.clearCookie(config.refreshCookieName, baseOptions);
  }

  return Object.freeze({ baseOptions, clear, read, set });
}

module.exports = { createRefreshCookieService };
