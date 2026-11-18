type DeletionDependencies = {
  query: (sql: string, params: string[]) => Promise<{ rows: any[] }>;
  removeRecording: (tenantId: string, recordingSid: string) => Promise<boolean>;
};

export async function deleteHelpVoicemail(
  tenantId: string, messageId: string, isAdmin: boolean, deps: DeletionDependencies,
) {
  const fail = (message: string, status: number): never => { throw Object.assign(new Error(message), { status }); };
  if (!isAdmin) fail("Only rescue admins can delete voicemail.", 403);
  const row = (await deps.query(`SELECT m.recording_sid,m.kind,m.status
    FROM rescue_help_messages m JOIN rescue_help_threads t ON t.id=m.thread_id
    WHERE m.id=$1 AND t.tenant_id=$2`, [messageId, tenantId])).rows[0];
  if (!row || row.kind !== "voicemail") fail("Voicemail not found.", 404);
  if (row.status === "deleted" && !row.recording_sid) return;
  if (!/^RE[a-f0-9]{32}$/i.test(row.recording_sid || "")) fail("Recording not found.", 404);
  try {
    if (!await deps.removeRecording(tenantId, row.recording_sid)) {
      fail("The recording could not be deleted. Please try again.", 502);
    }
  } catch (error: any) {
    // A retry after provider deletion but before the local update must still finish.
    // Never treat authentication errors, outages, or generic 404s as successful deletion.
    if (!(error.status === 404 && Number(error.code) === 20404)) {
      fail("The recording could not be deleted. Please try again.", 502);
    }
  }
  // Keep the message/provider event for history and webhook deduplication.
  await deps.query(`UPDATE rescue_help_messages m
    SET recording_sid=NULL,status='deleted',body='Voicemail deleted.'
    FROM rescue_help_threads t
    WHERE m.id=$1 AND m.thread_id=t.id AND t.tenant_id=$2 AND m.kind='voicemail'`,
    [messageId, tenantId]);
}
