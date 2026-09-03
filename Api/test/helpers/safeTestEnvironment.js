process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  "postgresql://test_sentinel:test_sentinel@127.0.0.1:1/leadhunt_test";
process.env.OPENAI_API_KEY = "test-openai-sentinel";
process.env.AUTH_OTP_HMAC_SECRET = "o".repeat(32);
process.env.AUTH_JWT_SECRET = "j".repeat(32);
process.env.AUTH_JWT_KEY_ID = "test-key";
process.env.AUTH_JWT_ISSUER = "leadhunt-api-test";
process.env.AUTH_JWT_AUDIENCE = "leadhunt-web-test";
process.env.AUTH_REFRESH_COOKIE_NAME = "test_refresh";
process.env.DEV_EMAIL_BYPASS_ENABLED = "false";
process.env.DEV_EMAIL_BYPASS_CODE = "";
process.env.RESEND_API_KEY = "";
process.env.AUTH_EMAIL_FROM = "";
process.env.AUTH_PASSWORD_RESET_URL = "";

const dotenv = require("dotenv");
dotenv.config = () => ({ parsed: {} });
