import { z } from "zod";
export const config = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().default(3000),
    APP_ORIGIN: z.string().url().default("http://localhost:5173"),
    DATABASE_URL: z
      .string()
      .default("postgres://civiclens:civiclens@localhost:5432/civiclens"),
    AUTH_SECRET: z
      .string()
      .min(32)
      .default("local-development-only-change-this-secret-before-deploying"),
    EMAIL_SERVER: z.string().default("smtp://localhost:1025"),
    EMAIL_FROM: z.string().default("CivicLens <hello@civiclens.local>"),
    S3_ENDPOINT: z.string().url().default("http://localhost:3900"),
    S3_REGION: z.string().default("garage"),
    S3_BUCKET: z.string().default("civiclens"),
    S3_ACCESS_KEY: z.string().default(""),
    S3_SECRET_KEY: z.string().default(""),
    GEMINI_API_KEY: z.string().optional(),
    GEMMA_MODEL: z.string().default("gemma-4-26b-a4b-it"),
    MODEL_PROVIDER: z.enum(["gemini", "ollama"]).default("ollama"),
    OLLAMA_IMAGE_SIZE: z.coerce.number().int().min(256).max(1600).default(512),
    OLLAMA_URL: z.string().url().default("http://127.0.0.1:11434"),
    OLLAMA_GEMMA_MODEL: z.string().default("gemma4:12b-mlx"),
    EMBEDDING_MODEL: z.string().default("embeddinggemma-2:740m"),
    EMBEDDING_ENDPOINT: z
      .string()
      .url()
      .default("http://127.0.0.1:11434/api/embed"),
    EMBEDDING_SECRET: z.string().optional(),
  })
  .parse(process.env);
if (
  config.NODE_ENV === "production" &&
  (config.AUTH_SECRET.startsWith("local-development") ||
    !config.S3_ACCESS_KEY ||
    !config.S3_SECRET_KEY)
)
  throw new Error("Production secrets and storage credentials are required.");
export const maxImageBytes = 8 * 1024 * 1024;
