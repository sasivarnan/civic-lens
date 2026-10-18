export async function api<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  let response: Response
  try {
    response = await fetch("/api" + path, {
      credentials: "same-origin",
      ...options,
      headers: {
        ...(options.body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        ...options.headers,
      },
    })
  } catch {
    throw new Error(
      "Cannot reach CivicLens. Check your connection and try again. Your unfinished form is still on this device."
    )
  }
  const data = await response.json().catch(() => {
    throw new Error(
      "CivicLens returned an unreadable response. Please try again."
    )
  })
  if (!response.ok) throw new Error(data.error ?? "The request failed.")
  return data as T
}
export async function sendEmailLink(email: string) {
  const { csrfToken } = await api<{ csrfToken: string }>("/auth/csrf")
  const data = await api<{ url?: string }>("/auth/signin/nodemailer", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Auth-Return-Redirect": "1",
    },
    body: new URLSearchParams({
      email,
      csrfToken,
      callbackUrl: location.origin + "/report/new",
    }),
  })
  if (typeof data.url !== "string" || data.url.includes("error="))
    throw new Error("The sign-in link could not be sent. Please try again.")
}
export async function signOut() {
  const { csrfToken } = await api<{ csrfToken: string }>("/auth/csrf")
  await api("/auth/signout", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Auth-Return-Redirect": "1",
    },
    body: new URLSearchParams({ csrfToken, callbackUrl: location.origin }),
  })
  location.assign("/")
}

export type Session = {
  user?: { id?: string; name?: string | null; email?: string; role?: string; demo?: boolean }
  demoMode?: boolean
}
// StrictMode mounts twice. Share the session request to avoid duplicate visitors.
let sessionRequest: Promise<Session> | undefined
export function loadSession(): Promise<Session> {
  if (!sessionRequest) {
    sessionRequest = api<Session>("/auth/session").then((session) =>
      session.demoMode && !session.user
        ? api<Session>("/demo-session", { method: "POST" })
        : session
    ).finally(() => { sessionRequest = undefined })
  }
  return sessionRequest
}
