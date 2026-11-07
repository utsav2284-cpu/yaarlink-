#!/usr/bin/env node
// Trusted operator only. Never logs or accepts credentials on the command line.
// No email is sent by this tool. Execute mode must not run before independently
// verified delivery, the exact live callback and the owner's public fingerprint.
import {parseManagementArguments} from './lib/production-management-cli.mjs';
import {managementPreflight} from './lib/production-management-preflight.mjs';
import {provisionViaManagement} from './lib/production-management-provision.mjs';

try {
 const args=parseManagementArguments(process.argv.slice(2));
 const managementToken=process.env.SUPABASE_PRODUCTION_MANAGEMENT_TOKEN;
 if (args['--dry-run']) {
  await managementPreflight(managementToken);
  console.log('Production management preflight passed. Nothing was created.');
 } else {
  await provisionViaManagement({managementToken,reference:'user-approved-production-owner',tokenFile:args['--token-file'],publicKeyFile:args['--recipient-public-key'],expectedFingerprint:args['--recipient-key-sha256'],deliveryVerified:args['--confirm-delivery-verified'],callbackVerified:args['--confirm-callback-verified']});
  console.log('Production bootstrap invitation created and encrypted token saved. No Auth invitation or email was sent.');
 }
} catch {
 console.error('Operation was not confirmed. Do not retry an uncertain invitation request; reconcile state and preserve any encrypted file. No secret values are displayed.');
 process.exitCode=1;
}
