import "server-only";
import { env } from "@/lib/env";

export async function sendEmail(opts: { to: string; subject: string; html: string; text: string }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.resendApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: env.resendFrom(), to: [opts.to], subject: opts.subject, html: opts.html, text: opts.text }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend respondió ${res.status}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as { id: string };
}
