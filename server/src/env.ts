import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(8080),
  ROOM_PORT: z.coerce.number().default(3002),
  DATABASE_URL: z.string().min(1),
  APP_ORIGIN: z.string().url(),
  SESSION_SECRET: z.string().min(16),
  OWNER_EMAIL: z.string().email(),
  OWNER_PASSWORD: z.string().min(6),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  SMTP_SECURE: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  UPLOAD_DIR: z.string().default("/data/uploads"),
  MAX_SCENE_BYTES: z.coerce.number().default(16 * 1024 * 1024),
  MAX_FILE_BYTES: z.coerce.number().default(8 * 1024 * 1024),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error(
    "Invalid server environment:",
    parsed.error.flatten().fieldErrors,
  );
  process.exit(1);
}

export const env = parsed.data;

export const isSecureOrigin = env.APP_ORIGIN.startsWith("https://");
