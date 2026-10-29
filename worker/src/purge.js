// Nightly: deletes submissions that were rejected and are older than the retention period (privacy policy, "Map
// submissions"; ADR 0003). Accepted maps, including ones taken down later, keep their records for the licence history.
// The bucket lock on submissions/ refuses deletes until the files are a year old, so a refused delete is retried
// the next night, and the database rows go only once the files are gone.

export async function purgeExpired(env, now = new Date()) {
  const days = Number(env.NOT_ACCEPTED_RETENTION_DAYS ?? 365);
  const before = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  const { results } = await env.DB.prepare(
    `SELECT s.id FROM submissions s
     WHERE s.received_at < ?
       AND (SELECT status FROM events v WHERE v.submission_id = s.id ORDER BY seq DESC LIMIT 1) = 'rejected'
       AND NOT EXISTS (SELECT 1 FROM events v WHERE v.submission_id = s.id AND v.status = 'accepted')`,
  )
    .bind(before)
    .all();
  const purged = [];
  for (const { id } of results) {
    const listed = await env.FILES.list({ prefix: `submissions/${id}/` });
    try {
      if (listed.objects.length) await env.FILES.delete(listed.objects.map((o) => o.key));
    } catch (error) {
      console.warn(`purge ${id}: files still locked`, String(error));
      continue;
    }
    await env.DB.batch([
      env.DB.prepare('INSERT INTO purges (submission_id, purged_at) VALUES (?, ?)').bind(id, now.toISOString()),
      env.DB.prepare('DELETE FROM events WHERE submission_id = ?').bind(id),
      env.DB.prepare('DELETE FROM submissions WHERE id = ?').bind(id),
    ]);
    purged.push(id);
  }
  return purged;
}
