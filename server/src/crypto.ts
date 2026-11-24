import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

export const randomToken = (bytes = 32) =>
  randomBytes(bytes).toString("base64url");

export const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

const SCRYPT_KEYLEN = 64;
const SCRYPT_PREFIX = "scrypt";

export const hashPassword = (password: string) => {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN);
  return `${SCRYPT_PREFIX}$${salt.toString("base64url")}$${derived.toString(
    "base64url",
  )}`;
};

export const verifyPassword = (password: string, stored: string | null) => {
  if (!stored) {
    return false;
  }
  const [prefix, saltPart, hashPart] = stored.split("$");
  if (prefix !== SCRYPT_PREFIX || !saltPart || !hashPart) {
    return false;
  }
  const salt = Buffer.from(saltPart, "base64url");
  const expected = Buffer.from(hashPart, "base64url");
  const derived = scryptSync(password, salt, expected.length);
  return (
    derived.length === expected.length && timingSafeEqual(derived, expected)
  );
};

export const generateRoomId = () => randomBytes(10).toString("base64url");

export const generateRoomKey = () => randomBytes(32).toString("base64url");
