# Preview migration records for offline reconstruction

These eight files were extracted from a **read-only** query of Preview `supabase_migrations.schema_migrations`. No user rows, credentials, keys or tokens were extracted. Files are historical records, **not active migrations**, and must never be applied to hosted databases.

The first four records had original trimmed-SQL MD5 values respectively `a774b70b61996b5ba07d3cc819f22060`, `6d966c155ca0a1ac09f2ab3064e41929`, `21e20da9b3bbc619352d52dbaded246b` and `c825db15fbd45406d6545103e411a97e`. The first two are unchanged except for local comment headers. From the third and fourth, the trailing seven and three synthetic business seed INSERTs respectively were removed; the remaining SQL has separate checksums in `tests/preview-history-records.test.mjs`. Other files are verbatim except local comment headers. MD5 here checks transcription only, not authenticity, security, or hosted drift.

Some records contain historically broken or weaker code later superseded by hardening: they must be replayed in order together with every later migration, never independently or as a final schema. The full local schema, ACL and RLS reconciliation remains unverified until the complete ordered replay passes with real Supabase Auth. Omission of demo business rows is intentional; real data must never be copied.
