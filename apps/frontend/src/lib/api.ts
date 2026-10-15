export async function api<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch("/api" + path, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  })
  const data = await response
    .json()
    .catch(() => ({ error: "The service returned an unreadable response." }))
  if (!response.ok) throw new Error(data.error ?? "The request failed.")
  return data as T
}
export async function sendEmailLink(email: string) {
  const { csrfToken } = await api<{ csrfToken: string }>("/auth/csrf")
  const r = await fetch("/api/auth/signin/nodemailer", {
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
  const data = await r.json().catch(() => ({}))
  if (!r.ok || data.url?.includes("error="))
    throw new Error("The sign-in link could not be sent. Please try again.")
}
export async function signOut() {
  const { csrfToken } = await api<{ csrfToken: string }>("/auth/csrf")
  await fetch("/api/auth/signout", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Auth-Return-Redirect": "1",
    },
    body: new URLSearchParams({ csrfToken, callbackUrl: location.origin }),
  })
  location.assign("/")
}
