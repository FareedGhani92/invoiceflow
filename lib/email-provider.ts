/** Read only the provider's recorded status; never infer delivery from acceptance. */
export async function retrieveEmailEvent(
  providerId: string,
  key: string,
  fetcher: typeof fetch = fetch,
): Promise<string | null> {
  const response = await fetcher(
    `https://api.resend.com/emails/${encodeURIComponent(providerId)}`,
    {
      headers: { Authorization: `Bearer ${key}` },
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    },
  );
  if (!response.ok)
    throw new Error(`Email status check returned HTTP ${response.status}.`);
  const result = (await response.json()) as {
    id?: string;
    last_event?: string;
  };
  if (result.id !== providerId)
    throw new Error("Email status reference did not match.");
  if (["delivered", "opened", "clicked"].includes(result.last_event || ""))
    return "email.delivered";
  if (
    ["bounced", "complained", "suppressed", "failed", "canceled"].includes(
      result.last_event || "",
    )
  )
    return `email.${result.last_event}`;
  return null;
}
