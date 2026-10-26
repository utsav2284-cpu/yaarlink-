import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No incremental cache needed: YaarLink pages fetch live data from the API.
export default defineCloudflareConfig({});
