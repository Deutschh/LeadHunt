function cloneValue(value) {
  if (Buffer.isBuffer(value)) {
    return Buffer.from(value);
  }

  if (value instanceof Date) {
    return new Date(value);
  }

  if (Array.isArray(value)) {
    return value.map(cloneValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneValue(item)]),
    );
  }

  return value;
}

function createFakeAuthDb(initialState = {}) {
  let transactionTail = Promise.resolve();
  const queryLog = [];
  const state = {
    now: new Date("2026-08-18T12:00:00.000Z"),
    users: [],
    challenges: [],
    workspaces: [
      {
        id: 1,
        slug: "internal-main",
        name: "LeadHunt Internal",
        account_status: "active",
        is_active: true,
      },
    ],
    memberships: [],
    commercialProfiles: [{ workspace_id: 1 }],
    refreshTokens: [],
    passwordResetTokens: [],
    nextUserId: 1,
    nextChallengeId: 1,
    nextRefreshTokenId: 1,
    nextPasswordResetTokenId: 1,
    ...cloneValue(initialState),
  };

  state.users = state.users.map((user) => ({
    auth_version: 0,
    last_login_at: null,
    ...user,
  }));
  state.workspaces = state.workspaces.map((workspace) => ({
    is_active: true,
    timezone: "America/Sao_Paulo",
    release_channel: "stable",
    min_profiles: 2,
    max_profiles: 2,
    ...workspace,
  }));

  function result(rows = []) {
    return { rows, rowCount: rows.length };
  }

  function marker(sql) {
    return (
      /\/\* auth(?:-(?:session|identity|password))?:([a-z-]+) \*\//.exec(
        sql,
      )?.[1] ||
      null
    );
  }

  function openChallengesForUser(userId) {
    return state.challenges
      .filter(
        (challenge) =>
          challenge.user_id === userId &&
          challenge.consumed_at === null &&
          challenge.invalidated_at === null,
      )
      .sort((left, right) => right.created_at - left.created_at);
  }

  function execute(sql, params = []) {
    const operation = marker(sql);

    if (operation) {
      queryLog.push(operation);
    }

    if (operation && state.failOperation === operation) {
      throw new Error(`Falha injetada em ${operation}`);
    }

    switch (operation) {
      case "insert-user": {
        const [name, email, passwordHash, termsVersion, privacyVersion] = params;
        const existing = state.users.find(
          (user) => user.email.toLowerCase() === email.toLowerCase(),
        );

        if (existing) {
          return result();
        }

        const user = {
          id: state.nextUserId++,
          name,
          email,
          password_hash: passwordHash,
          email_verified_at: null,
          terms_accepted_at: new Date(state.now),
          terms_version: termsVersion,
          privacy_policy_accepted_at: new Date(state.now),
          privacy_policy_version: privacyVersion,
          auth_version: 0,
          last_login_at: null,
        };
        state.users.push(user);
        return result([
          {
            id: user.id,
            email: user.email,
            email_verified_at: user.email_verified_at,
          },
        ]);
      }

      case "lock-existing-user":
      case "lock-user-for-resend": {
        const user = state.users.find(
          (item) => item.email.toLowerCase() === params[0].toLowerCase(),
        );
        return result(
          user
            ? [
                {
                  id: user.id,
                  email: user.email,
                  email_verified_at: user.email_verified_at,
                },
              ]
            : [],
        );
      }

      case "lock-user-for-verify": {
        const user = state.users.find(
          (item) => item.email.toLowerCase() === params[0].toLowerCase(),
        );
        return result(
          user
            ? [
                {
                  id: user.id,
                  name: user.name,
                  email_verified_at: user.email_verified_at,
                },
              ]
            : [],
        );
      }

      case "find-open-challenge": {
        const [userId, cooldownSeconds] = params;
        const challenge = openChallengesForUser(userId)[0];
        return result(
          challenge
            ? [
                {
                  id: challenge.id,
                  cooldown_active:
                    challenge.sent_at.getTime() >
                    state.now.getTime() - cooldownSeconds * 1000,
                },
              ]
            : [],
        );
      }

      case "count-recent-challenges": {
        const oneHourAgo = state.now.getTime() - 60 * 60 * 1000;
        return result([
          {
            challenge_count: state.challenges.filter(
              (challenge) =>
                challenge.user_id === params[0] &&
                challenge.created_at.getTime() >= oneHourAgo,
            ).length,
          },
        ]);
      }

      case "invalidate-previous-challenge":
      case "invalidate-failed-delivery": {
        const challenge = state.challenges.find(
          (item) =>
            item.id === params[0] &&
            item.user_id === params[1] &&
            item.consumed_at === null &&
            item.invalidated_at === null,
        );

        if (challenge) {
          challenge.invalidated_at = new Date(state.now);
        }

        return result(challenge ? [{}] : []);
      }

      case "reserve-challenge-id":
        return result([{ id: state.nextChallengeId++ }]);

      case "insert-challenge": {
        const [id, userId, digest, expiresInMinutes, maxAttempts] = params;
        state.challenges.push({
          id,
          user_id: userId,
          code_digest: Buffer.from(digest),
          expires_at: new Date(
            state.now.getTime() + expiresInMinutes * 60 * 1000,
          ),
          attempt_count: 0,
          max_attempts: maxAttempts,
          last_attempt_at: null,
          sent_at: new Date(state.now),
          consumed_at: null,
          invalidated_at: null,
          created_at: new Date(state.now),
        });
        return result([{}]);
      }

      case "find-consumed-challenge": {
        const retryWindowStart =
          state.now.getTime() - params[1] * 60 * 1000;
        const challenge = state.challenges
          .filter(
            (item) =>
              item.user_id === params[0] &&
              item.consumed_at !== null &&
              item.consumed_at.getTime() >= retryWindowStart,
          )
          .sort((left, right) => right.consumed_at - left.consumed_at)[0];
        return result(
          challenge
            ? [{ id: challenge.id, code_digest: challenge.code_digest }]
            : [],
        );
      }

      case "load-verified-workspace": {
        const membership = state.memberships.find(
          (item) => item.user_id === params[0],
        );

        if (!membership) {
          return result();
        }

        const workspace = state.workspaces.find(
          (item) => item.id === membership.workspace_id,
        );
        const profile = state.commercialProfiles.find(
          (item) => item.workspace_id === membership.workspace_id,
        );

        return result(
          workspace
            ? [
                {
                  workspace_id: membership.workspace_id,
                  role: membership.role,
                  account_status: workspace.account_status,
                  commercial_profile_workspace_id: profile
                    ? profile.workspace_id
                    : null,
                },
              ]
            : [],
        );
      }

      case "lock-open-challenge-for-verify": {
        const challenge = openChallengesForUser(params[0])[0];
        return result(
          challenge
            ? [
                {
                  id: challenge.id,
                  code_digest: challenge.code_digest,
                  attempt_count: challenge.attempt_count,
                  max_attempts: challenge.max_attempts,
                  expired: challenge.expires_at <= state.now,
                },
              ]
            : [],
        );
      }

      case "invalidate-unusable-challenge": {
        const challenge = state.challenges.find(
          (item) =>
            item.id === params[0] &&
            item.consumed_at === null &&
            item.invalidated_at === null,
        );
        if (challenge) {
          challenge.invalidated_at = new Date(state.now);
        }
        return result(challenge ? [{}] : []);
      }

      case "record-failed-attempt": {
        const challenge = state.challenges.find(
          (item) =>
            item.id === params[0] &&
            item.consumed_at === null &&
            item.invalidated_at === null,
        );
        if (challenge) {
          challenge.attempt_count += 1;
          challenge.last_attempt_at = new Date(state.now);
          if (challenge.attempt_count >= challenge.max_attempts) {
            challenge.invalidated_at = new Date(state.now);
          }
        }
        return result(challenge ? [{}] : []);
      }

      case "check-existing-membership": {
        const memberships = state.memberships
          .filter((item) => item.user_id === params[0])
          .map((item) => ({ workspace_id: item.workspace_id }));
        return result(memberships);
      }

      case "verify-user-email": {
        const user = state.users.find(
          (item) => item.id === params[0] && item.email_verified_at === null,
        );
        if (user) {
          user.email_verified_at = new Date(state.now);
        }
        return result(user ? [{ id: user.id }] : []);
      }

      case "consume-challenge": {
        const challenge = state.challenges.find(
          (item) =>
            item.id === params[0] &&
            item.consumed_at === null &&
            item.invalidated_at === null,
        );
        if (challenge) {
          challenge.code_digest = Buffer.from(params[1]);
          challenge.attempt_count += 1;
          challenge.last_attempt_at = new Date(state.now);
          challenge.consumed_at = new Date(state.now);
        }
        return result(challenge ? [{ id: challenge.id }] : []);
      }

      case "lock-forgot-user": {
        const user = state.users.find(
          (item) => item.email.toLowerCase() === params[0].toLowerCase(),
        );
        return result(
          user
            ? [
                {
                  id: user.id,
                  email: user.email,
                  email_verified_at: user.email_verified_at,
                },
              ]
            : [],
        );
      }

      case "lock-open-reset-token": {
        const token = state.passwordResetTokens
          .filter(
            (item) =>
              item.user_id === params[0] &&
              item.consumed_at === null &&
              item.invalidated_at === null,
          )
          .sort((left, right) => right.created_at - left.created_at)[0];
        return result(token ? [{ id: token.id }] : []);
      }

      case "invalidate-previous-reset-token":
      case "invalidate-failed-delivery-token": {
        const token = state.passwordResetTokens.find(
          (item) =>
            item.id === params[0] &&
            item.user_id === params[1] &&
            item.consumed_at === null &&
            item.invalidated_at === null,
        );
        if (token) {
          token.invalidated_at = new Date(state.now);
        }
        return result(token ? [{ id: token.id }] : []);
      }

      case "insert-reset-token": {
        const [userId, digest, expiresInMinutes] = params;
        const duplicateDigest = state.passwordResetTokens.some((item) =>
          item.token_digest.equals(digest),
        );
        const activeUser = state.passwordResetTokens.some(
          (item) =>
            item.user_id === userId &&
            item.consumed_at === null &&
            item.invalidated_at === null,
        );
        if (duplicateDigest || activeUser) {
          throw new Error("unique violation");
        }
        const token = {
          id: state.nextPasswordResetTokenId++,
          user_id: userId,
          token_digest: Buffer.from(digest),
          expires_at: new Date(
            state.now.getTime() + expiresInMinutes * 60 * 1000,
          ),
          consumed_at: null,
          invalidated_at: null,
          created_at: new Date(state.now),
        };
        state.passwordResetTokens.push(token);
        return result([{ id: token.id, expires_at: token.expires_at }]);
      }

      case "lock-failed-delivery-user":
      case "lock-reset-user": {
        const user = state.users.find((item) => item.id === params[0]);
        return result(
          user
            ? [{ id: user.id, email_verified_at: user.email_verified_at }]
            : [],
        );
      }

      case "lock-failed-delivery-token": {
        const token = state.passwordResetTokens.find(
          (item) => item.id === params[0] && item.user_id === params[1],
        );
        return result(
          token
            ? [
                {
                  id: token.id,
                  consumed_at: token.consumed_at,
                  invalidated_at: token.invalidated_at,
                },
              ]
            : [],
        );
      }

      case "find-reset-owner": {
        const token = state.passwordResetTokens.find((item) =>
          item.token_digest.equals(params[0]),
        );
        return result(token ? [{ user_id: token.user_id }] : []);
      }

      case "lock-reset-token": {
        const token = state.passwordResetTokens.find(
          (item) =>
            item.token_digest.equals(params[0]) &&
            item.user_id === params[1],
        );
        return result(
          token
            ? [
                {
                  id: token.id,
                  user_id: token.user_id,
                  consumed_at: token.consumed_at,
                  invalidated_at: token.invalidated_at,
                  expired: token.expires_at <= state.now,
                },
              ]
            : [],
        );
      }

      case "lock-user-refresh-tokens": {
        return result(
          state.refreshTokens
            .filter(
              (item) =>
                item.user_id === params[0] && item.revoked_at === null,
            )
            .sort((left, right) => left.id - right.id)
            .map((item) => ({ id: item.id })),
        );
      }

      case "update-password-and-version": {
        const user = state.users.find((item) => item.id === params[0]);
        if (user) {
          user.password_hash = params[1];
          user.auth_version += 1;
          user.updated_at = new Date(state.now);
        }
        return result(
          user ? [{ id: user.id, auth_version: user.auth_version }] : [],
        );
      }

      case "consume-reset-token": {
        const token = state.passwordResetTokens.find(
          (item) =>
            item.id === params[0] &&
            item.user_id === params[1] &&
            item.consumed_at === null &&
            item.invalidated_at === null &&
            item.expires_at > state.now,
        );
        if (token) {
          token.consumed_at = new Date(state.now);
        }
        return result(token ? [{ id: token.id }] : []);
      }

      case "revoke-user-refresh-tokens": {
        const revoked = [];
        for (const token of state.refreshTokens) {
          if (token.user_id === params[0] && token.revoked_at === null) {
            token.revoked_at = new Date(state.now);
            token.revocation_reason = "password_reset";
            revoked.push({ id: token.id });
          }
        }
        return result(revoked);
      }

      case "create-workspace": {
        const nextId = Math.max(...state.workspaces.map((item) => item.id)) + 1;
        const workspace = {
          id: nextId,
          slug: params[0],
          name: params[1],
          account_status: "pending",
          is_active: true,
          timezone: "America/Sao_Paulo",
          release_channel: "stable",
          min_profiles: 2,
          max_profiles: 2,
        };
        state.workspaces.push(workspace);
        return result([
          { id: workspace.id, account_status: workspace.account_status },
        ]);
      }

      case "create-owner-membership":
        state.memberships.push({
          workspace_id: params[0],
          user_id: params[1],
          role: "owner",
        });
        return result([{}]);

      case "create-commercial-profile":
        state.commercialProfiles.push({ workspace_id: params[0] });
        return result([{}]);

      case "find-login-user": {
        const user = state.users.find(
          (item) => item.email.toLowerCase() === params[0].toLowerCase(),
        );
        return result(
          user
            ? [
                {
                  id: user.id,
                  password_hash: user.password_hash,
                  email_verified_at: user.email_verified_at,
                },
              ]
            : [],
        );
      }

      case "lock-login-user": {
        const user = state.users.find((item) => item.id === params[0]);
        return result(
          user
            ? [
                {
                  id: user.id,
                  password_hash: user.password_hash,
                  email_verified_at: user.email_verified_at,
                  auth_version: user.auth_version,
                },
              ]
            : [],
        );
      }

      case "load-user-workspace": {
        const memberships = state.memberships.filter(
          (item) => item.user_id === params[0],
        );
        return result(
          memberships
            .filter((membership) =>
              state.workspaces.some(
                (workspace) => workspace.id === membership.workspace_id,
              ),
            )
            .map((membership) => ({
              workspace_id: membership.workspace_id,
            })),
        );
      }

      case "resolve-context": {
        const user = state.users.find(
          (item) => String(item.id) === String(params[0]),
        );

        if (!user) {
          return result();
        }

        const memberships = state.memberships.filter(
          (item) => String(item.user_id) === String(user.id),
        );
        const selectedMemberships = memberships.length > 0 ? memberships : [null];
        return result(
          selectedMemberships.slice(0, 2).map((membership) => {
            const workspace = membership
              ? state.workspaces.find(
                  (item) =>
                    String(item.id) === String(membership.workspace_id),
                )
              : null;

            return {
              user_id: String(user.id),
              user_name: user.name,
              user_email: user.email,
              auth_version: user.auth_version,
              email_verified_at: user.email_verified_at,
              membership_user_id: membership
                ? String(membership.user_id)
                : null,
              membership_workspace_id: membership
                ? String(membership.workspace_id)
                : null,
              membership_role: membership?.role ?? null,
              workspace_id: workspace ? String(workspace.id) : null,
              workspace_name: workspace?.name ?? null,
              workspace_account_status: workspace?.account_status ?? null,
              workspace_is_active: workspace?.is_active ?? null,
              workspace_timezone: workspace?.timezone ?? null,
              workspace_release_channel: workspace?.release_channel ?? null,
              workspace_min_profiles: workspace?.min_profiles ?? null,
              workspace_max_profiles: workspace?.max_profiles ?? null,
            };
          }),
        );
      }

      case "insert-refresh-token": {
        const [userId, digest, familyId, expiresAt, authVersionAtIssue] = params;
        const duplicateDigest = state.refreshTokens.some((token) =>
          token.token_digest.equals(digest),
        );
        const activeFamily = state.refreshTokens.some(
          (token) =>
            token.family_id === familyId && token.revoked_at === null,
        );
        if (duplicateDigest || activeFamily) {
          throw new Error("unique violation");
        }
        const token = {
          id: state.nextRefreshTokenId++,
          user_id: userId,
          token_digest: Buffer.from(digest),
          family_id: familyId,
          replaced_by_token_id: null,
          expires_at: new Date(expiresAt),
          last_used_at: null,
          revoked_at: null,
          revocation_reason: null,
          created_at: new Date(state.now),
          auth_version_at_issue: authVersionAtIssue,
        };
        state.refreshTokens.push(token);
        return result([{ id: token.id, expires_at: token.expires_at }]);
      }

      case "update-last-login": {
        const user = state.users.find((item) => item.id === params[0]);
        if (user) {
          user.last_login_at = new Date(state.now);
        }
        return result(user ? [{ id: user.id }] : []);
      }

      case "lock-refresh-token": {
        const token = state.refreshTokens.find((item) =>
          item.token_digest.equals(params[0]) && item.user_id === params[1],
        );
        return result(
          token
            ? [
                {
                  id: token.id,
                  user_id: token.user_id,
                  family_id: token.family_id,
                  expires_at: token.expires_at,
                  revoked_at: token.revoked_at,
                  revocation_reason: token.revocation_reason,
                  replaced_by_token_id: token.replaced_by_token_id,
                  auth_version_at_issue: token.auth_version_at_issue,
                },
              ]
            : [],
        );
      }

      case "find-refresh-owner":
      case "find-logout-owner": {
        const token = state.refreshTokens.find((item) =>
          item.token_digest.equals(params[0]),
        );
        return result(token ? [{ user_id: token.user_id }] : []);
      }

      case "lock-refresh-user": {
        const user = state.users.find((item) => item.id === params[0]);
        return result(
          user
            ? [
                {
                  id: user.id,
                  auth_version: user.auth_version,
                  email_verified_at: user.email_verified_at,
                },
              ]
            : [],
        );
      }

      case "lock-logout-user": {
        const user = state.users.find((item) => item.id === params[0]);
        return result(user ? [{ id: user.id }] : []);
      }

      case "revoke-refresh-family": {
        let count = 0;
        for (const token of state.refreshTokens) {
          if (token.family_id === params[0] && token.revoked_at === null) {
            token.revoked_at = new Date(state.now);
            token.revocation_reason = params[1];
            count += 1;
          }
        }
        return { rows: [], rowCount: count };
      }

      case "rotate-current-token": {
        const token = state.refreshTokens.find(
          (item) => item.id === params[0] && item.revoked_at === null,
        );
        if (token) {
          token.last_used_at = new Date(state.now);
          token.revoked_at = new Date(state.now);
          token.revocation_reason = "rotated";
        }
        return result(token ? [{ id: token.id }] : []);
      }

      case "link-refresh-replacement": {
        const token = state.refreshTokens.find(
          (item) =>
            item.id === params[0] && item.revocation_reason === "rotated",
        );
        if (token) {
          token.replaced_by_token_id = params[1];
        }
        return result(token ? [{ id: token.id }] : []);
      }

      case "lock-logout-token": {
        const token = state.refreshTokens.find((item) =>
          item.token_digest.equals(params[0]) && item.user_id === params[1],
        );
        return result(
          token ? [{ id: token.id, family_id: token.family_id }] : [],
        );
      }

      default:
        throw new Error(`Query não suportada pelo fake: ${sql}`);
    }
  }

  return {
    state,
    queryLog,
    query: async (sql, params) => execute(sql, params),
    connect: async () => {
      let snapshot = null;
      let releaseTransaction = null;

      return {
        query: async (sql, params) => {
          const command = sql.trim().toUpperCase();

          if (command === "BEGIN") {
            const previousTransaction = transactionTail;
            transactionTail = new Promise((resolve) => {
              releaseTransaction = resolve;
            });
            await previousTransaction;
            snapshot = cloneValue(state);
            return result();
          }

          if (command === "COMMIT") {
            snapshot = null;
            releaseTransaction?.();
            releaseTransaction = null;
            return result();
          }

          if (command === "ROLLBACK") {
            if (snapshot) {
              for (const key of Object.keys(state)) {
                delete state[key];
              }
              Object.assign(state, snapshot);
            }
            snapshot = null;
            releaseTransaction?.();
            releaseTransaction = null;
            return result();
          }

          if (command.startsWith("SET LOCAL")) {
            return result();
          }

          return execute(sql, params);
        },
        release: () => {},
      };
    },
  };
}

module.exports = { createFakeAuthDb };
