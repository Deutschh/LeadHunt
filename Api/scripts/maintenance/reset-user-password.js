#!/usr/bin/env node

const { Pool } = require("pg");
const {
  AccountPasswordMaintenanceError,
  createAccountPasswordService,
} = require("../../src/services/accountPasswordService");
const {
  passwordCryptoService,
} = require("../../src/services/authCryptoService");

function readEmailArgument(argv) {
  const emailIndexes = argv
    .map((value, index) => (value === "--email" ? index : -1))
    .filter((index) => index >= 0);
  if (emailIndexes.length !== 1) {
    throw new AccountPasswordMaintenanceError(
      "EMAIL_ARGUMENT_REQUIRED",
      'Use exatamente uma vez: --email "usuario@dominio.com".',
    );
  }

  const index = emailIndexes[0];
  const email = argv[index + 1];
  if (
    typeof email !== "string" ||
    email.startsWith("--") ||
    argv.length !== 2
  ) {
    throw new AccountPasswordMaintenanceError(
      "INVALID_ARGUMENTS",
      'Uso: npm run maintenance:reset-password -- --email "usuario@dominio.com".',
    );
  }
  return email;
}

function promptHidden(label, { stdin = process.stdin, stdout = process.stdout } = {}) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    return Promise.reject(
      new AccountPasswordMaintenanceError(
        "INTERACTIVE_TERMINAL_REQUIRED",
        "Execute a ferramenta em um terminal interativo.",
      ),
    );
  }

  stdout.write(label);
  stdin.setEncoding("utf8");
  stdin.setRawMode(true);
  stdin.resume();

  return new Promise((resolve, reject) => {
    let value = "";

    function cleanup() {
      stdin.removeListener("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
    }

    function onData(chunk) {
      for (const character of chunk) {
        if (character === "\u0003") {
          cleanup();
          reject(
            new AccountPasswordMaintenanceError(
              "OPERATION_CANCELLED",
              "Operação cancelada.",
            ),
          );
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          resolve(value);
          return;
        }
        if (character === "\u0008" || character === "\u007f") {
          value = Array.from(value).slice(0, -1).join("");
          continue;
        }
        value += character;
      }
    }

    stdin.on("data", onData);
  });
}

async function run({
  argv = process.argv.slice(2),
  env = process.env,
  prompt = promptHidden,
  poolFactory = (connectionString) =>
    new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 1,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    }),
  stdout = process.stdout,
} = {}) {
  const email = readEmailArgument(argv);
  const connectionString =
    env.LEADHUNT_MAINTENANCE_DATABASE_URL ||
    (await prompt("URL de conexão PostgreSQL: "));
  if (connectionString.length === 0) {
    throw new AccountPasswordMaintenanceError(
      "DATABASE_URL_REQUIRED",
      "A URL de conexão PostgreSQL é obrigatória.",
    );
  }

  const newPassword = await prompt("Nova senha: ");
  const confirmation = await prompt("Confirme a nova senha: ");
  if (newPassword !== confirmation) {
    throw new AccountPasswordMaintenanceError(
      "PASSWORD_CONFIRMATION_MISMATCH",
      "A confirmação da senha não corresponde.",
    );
  }

  const pool = poolFactory(connectionString);
  try {
    const service = createAccountPasswordService({
      db: pool,
      cryptoService: passwordCryptoService,
    });
    await service.resetPasswordByEmail({ email, newPassword });
    stdout.write("Senha redefinida e sessões existentes revogadas.\n");
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  run().catch((error) => {
    const message =
      error instanceof AccountPasswordMaintenanceError
        ? error.publicMessage
        : "Não foi possível redefinir a senha.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  promptHidden,
  readEmailArgument,
  run,
};
