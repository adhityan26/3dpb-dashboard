import type { EmailProviderSendVerificationRequestParams } from "@auth/core/providers/email";
import { canSendMagicLink, recordMagicLinkSent } from "./rate-limit";

// Custom sendVerificationRequest passed into Resend({...}) in lib/auth.ts -- Auth.js
// completely replaces the provider's default implementation when this is supplied, so
// the actual Resend API call below is a deliberate, minimal duplicate of @auth/core's
// own default (not something we can delegate to and still gate). Throwing is the only
// way Auth.js can be told the send failed (email providers have no return-value contract).
export async function sendVerificationRequest(params: EmailProviderSendVerificationRequestParams): Promise<void> {
  const { identifier: to, provider, url } = params;

  const gate = await canSendMagicLink(to);
  if (!gate.ok) throw new Error(`rate_limited (wait ${gate.waitSec}s)`);

  await recordMagicLinkSent(to);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: provider.from,
      to,
      subject: "Masuk ke Slizebiz",
      html: `<p>Klik link berikut untuk masuk ke Slizebiz:</p><p><a href="${url}">${url}</a></p><p>Link berlaku 24 jam, jangan dibagikan ke siapa pun.</p>`,
      text: `Klik link berikut untuk masuk ke Slizebiz: ${url}\n\nLink berlaku 24 jam, jangan dibagikan ke siapa pun.`,
    }),
  });

  if (!res.ok) throw new Error("Resend error: " + JSON.stringify(await res.json()));
}
