declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      ASSETS: Fetcher;
      ADMIN_TOKEN: string;
      AI_BASE_URL: string;
      AI_API_KEY: string;
      AI_MODEL: string;
    }
  }
}

export {};
