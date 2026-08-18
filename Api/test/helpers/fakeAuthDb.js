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
      },
    ],
    memberships: [],
    commercialProfiles: [{ workspace_id: 1 }],
    nextUserId: 1,
    nextChallengeId: 1,
    ...cloneValue(initialState),
  };

  function result(rows = []) {
    return { rows, rowCount: rows.length };
  }

  function marker(sql) {
    return /\/\* auth:([a-z-]+) \*\//.exec(sql)?.[1] || null;
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

      case "create-workspace": {
        const nextId = Math.max(...state.workspaces.map((item) => item.id)) + 1;
        const workspace = {
          id: nextId,
          slug: params[0],
          name: params[1],
          account_status: "pending",
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

      default:
        throw new Error(`Query não suportada pelo fake: ${sql}`);
    }
  }

  return {
    state,
    query: async (sql, params) => execute(sql, params),
    connect: async () => {
      let snapshot = null;

      return {
        query: async (sql, params) => {
          const command = sql.trim().toUpperCase();

          if (command === "BEGIN") {
            snapshot = cloneValue(state);
            return result();
          }

          if (command === "COMMIT") {
            snapshot = null;
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
