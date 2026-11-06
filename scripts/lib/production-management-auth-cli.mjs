export function parseAuthInviteArguments(args) {
 const required=['--execute','--confirm-delivery-verified','--confirm-callback-verified','--confirm-ciphertext-received'];
 if (args.length!==required.length || new Set(args).size!==required.length || required.some(x=>!args.includes(x))) throw new Error('All independent checks and execute confirmation are required');
 return {deliveryVerified:true,callbackVerified:true,ciphertextDelivered:true};
}
