// Navigation is only a convenience. The database claim procedure is the
// authorization boundary; a status-check failure never grants ownership.
export async function destinationAfterMfa(check: () => Promise<{data: unknown; error: unknown}>): Promise<"/admin/setup" | "/admin"> {
  try {
    const { data, error } = await check();
    return !error && data === true ? "/admin/setup" : "/admin";
  } catch { return "/admin"; }
}
