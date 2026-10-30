/// <reference types="@cloudflare/vitest-plugin/types" />

declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    OAUTH_KV: KVNamespace;
    ASSETS: Fetcher;
    ACCESS_TEAM_DOMAIN: string;
    ACCESS_AUD: string;
    OWNER_EMAIL: string;
    ACCESS_SERVICE_CLIENT_IDS?: string;
    DEV_BYPASS_ACCESS?: string;
    TEST_MIGRATIONS: { name: string; queries: string[] }[];
  }
}
