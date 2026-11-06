#!/usr/bin/env node
// Do not run until independent delivery, exact callback and owner receipt have
// all been verified. Never accept secrets on the command line.
import {parseAuthInviteArguments} from './lib/production-management-auth-cli.mjs';
import {inviteOwnerViaManagement} from './lib/production-management-auth-invite.mjs';
try {
 const checks=parseAuthInviteArguments(process.argv.slice(2));
 await inviteOwnerViaManagement({managementToken:process.env.SUPABASE_PRODUCTION_MANAGEMENT_TOKEN,serviceKey:process.env.SUPABASE_PRODUCTION_SERVICE_ROLE_KEY,...checks});
 console.log('Request accepted by Supabase Auth. This does not confirm email delivery or ownership.');
} catch {
 console.error('Request not confirmed. Do not retry without reconciling the reservation and Auth state. No secret values are displayed.');
 process.exitCode=1;
}
