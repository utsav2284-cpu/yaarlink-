// Strict operator arguments; never accept a token or password as an argument.
export function parseManagementArguments(args) {
 const values={}, flags=new Set(['--dry-run','--execute','--confirm-delivery-verified','--confirm-callback-verified']);
 const options=new Set(['--token-file','--recipient-public-key','--recipient-key-sha256']);
 for(let i=0;i<args.length;i++) {
  const name=args[i];
  if ((!flags.has(name) && !options.has(name)) || values[name]!==undefined) throw new Error('Invalid arguments');
  if(flags.has(name)) values[name]=true;
  else {
   if(!args[i+1] || args[i+1].startsWith('--')) throw new Error('Missing argument');
   values[name]=args[++i];
  }
 }
 if (!!values['--dry-run']===!!values['--execute']) throw new Error('Select exactly one mode');
 if (values['--dry-run'] && Object.keys(values).length!==1) throw new Error('Dry run takes no other arguments');
 if (values['--execute'] && (!values['--confirm-delivery-verified'] || !values['--confirm-callback-verified'] || !values['--token-file'] || !values['--recipient-public-key'] || !values['--recipient-key-sha256'])) throw new Error('Missing execute-mode verification or output');
 return values;
}
