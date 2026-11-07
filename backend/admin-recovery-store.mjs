// Not exposed to a request handler. This adapter must only be used after a
// trusted server validates the caller's JWT against the dedicated Preview Auth
// service. A caller must never construct `claims` from unverified input.
// The supplied pool must be a Preview-only server connection; keep its
// credential and recovery pepper exclusively in the server secret store.
export function createRecoveryStore(pool, claims) {
  if (!claims || typeof claims.sub !== 'string' || !/^[0-9a-f-]{36}$/i.test(claims.sub)) throw new Error('Invalid verified identity');
  const uid = claims.sub;
  return {
    async transaction(userId, fn) {
      if (userId !== uid) throw new Error('Identity mismatch');
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query('set local role preview_recovery_runtime');
        await client.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(claims)]);
        // A transaction-scoped advisory lock serializes recovery for this user
        // without granting UPDATE on admin profiles. All recovery paths use it.
        await client.query('select pg_advisory_xact_lock(hashtextextended($1::text, 762014))', [uid]);
        const locked = await client.query("select auth_user_id from admin.admin_profiles where auth_user_id=$1 and status='active'", [uid]);
        if (locked.rowCount !== 1) throw new Error('Not authorized');
        const tx = {
          async authorizeGeneration() {
            const r = await client.query('select admin.is_active_admin() and admin.has_aal2() and admin.session_is_current() and admin.has_verified_totp_factor() and admin.recovery_has_fresh_totp() as allowed');
            return r.rows[0]?.allowed === true;
          },
          async authorizeRedemption() {
            const r = await client.query('select admin.is_active_admin() as allowed');
            return r.rows[0]?.allowed === true;
          },
          async recoveryPending() {
            const r = await client.query('select recovery_pending from admin.admin_recovery_controls where auth_user_id=$1', [uid]);
            return r.rows[0]?.recovery_pending === true;
          },
          async invalidateAll() {
            await client.query('update admin.admin_recovery_codes set invalidated_at=now() where auth_user_id=$1 and used_at is null and invalidated_at is null', [uid]);
          },
          async insertCodes(rows) {
            for (const row of rows) await client.query('insert into admin.admin_recovery_codes(auth_user_id,code_index,code_hash,expires_at) values ($1,$2,$3,$4)', [uid,row.index,row.hash,new Date(row.expiresAt)]);
          },
          async getCode(index) {
            const r = await client.query('select id,code_hash,used_at,invalidated_at,expires_at from admin.admin_recovery_codes where auth_user_id=$1 and code_index=$2 order by (used_at is null and invalidated_at is null) desc,created_at desc,id desc limit 1', [uid,index]);
            const x = r.rows[0];
            if (!x || !/^\$2[aby]\$12\$/.test(x.code_hash) || !x.expires_at) return null;
            return { id:x.id, hash:x.code_hash, usedAt:x.used_at, invalidatedAt:x.invalidated_at, expiresAt:new Date(x.expires_at).getTime() };
          },
          async countFailuresSince(since) {
            const r = await client.query('select count(*)::int as n from admin.admin_recovery_attempts where auth_user_id=$1 and attempted_at >= $2', [uid,new Date(since)]);
            return r.rows[0].n;
          },
          async consume(id, now) {
            const r = await client.query('update admin.admin_recovery_codes set used_at=$3 where id=$1 and auth_user_id=$2 and used_at is null and invalidated_at is null and expires_at>$3 returning id', [id,uid,new Date(now)]);
            return r.rowCount === 1;
          },
          async failure(now) { await client.query('insert into admin.admin_recovery_attempts(auth_user_id,attempted_at) values ($1,$2)', [uid,new Date(now)]); },
          async requireAssistedRecovery(now) {
            await client.query('insert into admin.admin_recovery_controls(auth_user_id,recovery_pending,requested_at) values ($1,true,$2) on conflict (auth_user_id) do update set recovery_pending=true,requested_at=excluded.requested_at', [uid,new Date(now)]);
          },
          async revokeSessions(now) { await client.query('update admin.admin_session_registry set revoked_at=$2,revoke_reason=$3 where auth_user_id=$1 and revoked_at is null', [uid,new Date(now),'assisted_recovery']); },
          async event(event) {
            if (!['recovery_codes_regenerated','recovery_code_failed','recovery_rate_limited','recovery_code_used'].includes(event)) throw new Error('Invalid event');
            await client.query('select admin.log_recovery_event($1)', [event]);
          }
        };
        const result = await fn(tx);
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback').catch(() => {});
        throw error;
      } finally { client.release(); }
    }
  };
}
