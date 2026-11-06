#!/usr/bin/env node
// Non-mutating production management preflight; this is not owner provisioning.
import { managementPreflight } from './lib/production-management-preflight.mjs';

if (process.argv.length !== 3 || process.argv[2] !== '--dry-run') {
  console.error('Only --dry-run is supported. No invitation was created.');
  process.exitCode = 1;
} else {
  try {
    await managementPreflight(process.env.SUPABASE_PRODUCTION_MANAGEMENT_TOKEN);
    console.log('Production management preflight passed; no invitation was created.');
  } catch {
    console.error('Production management preflight was not confirmed; no invitation was created.');
    process.exitCode = 1;
  }
}
