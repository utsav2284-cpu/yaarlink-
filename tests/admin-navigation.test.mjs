import test from 'node:test';
import assert from 'node:assert/strict';
import { destinationAfterMfa } from '../lib/admin-navigation.ts';
test('first owner is guided to setup only on a successful server confirmation',async()=>{
 assert.equal(await destinationAfterMfa(async()=>({data:true,error:null})),'/admin/setup');
 for (const response of [{data:false,error:null},{data:null,error:{}},{data:'true',error:null}]) assert.equal(await destinationAfterMfa(async()=>response),'/admin');
 assert.equal(await destinationAfterMfa(async()=>{throw new Error('offline');}),'/admin');
});
