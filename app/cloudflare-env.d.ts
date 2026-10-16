declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    PDS_AUTH_SECRET?: string;
    PDS_LEGACY_OWNER_USERNAME?: string;
    PDS_LEGACY_CLAIM_SECRET?: string;
  }
}
