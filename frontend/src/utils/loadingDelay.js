export const MIN_SKELETON_MS = 450;

export async function waitForMinimumLoading(startedAt, minMs = MIN_SKELETON_MS) {
  const elapsed = Date.now() - startedAt;
  const remaining = minMs - elapsed;
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}
