interface SaveResult {
  error: unknown;
}

export function isSnapshotTransportError(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null && 'message' in error
      ? String(error.message)
      : '';
  return /failed to fetch|networkerror|network request failed|load failed/i.test(message);
}

/** A lost response is not a failed commit; verify this attempt before aborting. */
export async function saveSnapshotWithRecovery(
  write: () => PromiseLike<SaveResult>,
  verifyThisAttempt: () => Promise<boolean>,
): Promise<void> {
  try {
    const result = await write();
    if (result.error) throw result.error;
  } catch (error) {
    if (!isSnapshotTransportError(error)) throw error;
    try {
      if (await verifyThisAttempt()) return;
    } catch {
      // Preserve the original failure when verification is also unavailable.
    }
    throw error;
  }
}