export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}

/** Map database errors to messages a person can act on. */
export function friendlyDbError(message: string | undefined): string {
  if (!message) return "Something went wrong. Please try again.";
  if (message.includes("scheduled_sessions_no_overlap")) {
    return "That would put two things at the same time. Your calendar may have changed — please refresh and try again.";
  }
  if (message.includes("violates check constraint")) return "Some of those values aren't valid. Please check the form.";
  if (message.includes("JWT") || message.includes("not authenticated")) return "Your session has expired. Please log in again.";
  return message;
}
