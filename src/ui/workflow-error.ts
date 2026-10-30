// ABOUTME: Human-readable failure copy; raw checked errors remain in the persisted task for diagnosis.
export function workflowErrorText(message: string): string {
  if (/\bweeks\.\d+\.actions\.\d+\.successCheck\b/.test(message))
    return "The generated plan could not pass its checks. Retry or review your details.";
  if (message === "Failed to fetch" || message === "fetch failed")
    return "The connection was interrupted before the update finished.";
  if (/unexpected token.*<|not valid JSON/i.test(message))
    return "The coach returned an unreadable response. Your saved information is preserved.";
  if (/timed out|timeout/i.test(message))
    return "This update took too long to complete.";
  if (
    /used its candidate and one repair|exhausted its bounded submission budget/i.test(
      message,
    )
  )
    return "The coach could not complete a valid update. Retry, or review your details.";
  try {
    const issues: unknown = JSON.parse(message);
    if (
      Array.isArray(issues) &&
      issues.length &&
      issues.every(
        (issue) =>
          issue &&
          typeof issue.code === "string" &&
          Array.isArray(issue.path) &&
          typeof issue.message === "string",
      )
    )
      return "The update could not be validated. Your saved information is preserved. Retry, or review your details.";
  } catch {
    /* Ordinary human-readable errors pass through unchanged. */
  }
  return message;
}
