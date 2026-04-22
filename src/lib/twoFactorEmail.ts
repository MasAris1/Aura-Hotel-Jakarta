export async function sendTwoFactorEmail(email: string, code: string) {
  if (process.env.NODE_ENV !== "production") {
    console.info(`[2FA] Verification code for ${email}: ${code}`);
  }

  if (!process.env.RESEND_API_KEY) {
    if (process.env.NODE_ENV !== "production") return;

    throw new Error("Email verification is not configured.");
  }

  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);

  await resend.emails.send({
    from: "Aura Hotel <noreply@aura-hotel-jakarta.com>",
    to: email,
    subject: "Your Aura verification code",
    html: `
      <div style="font-family: Inter, Arial, sans-serif; color: #111; line-height: 1.6;">
        <p>Use this verification code to finish signing in to Aura Hotel Jakarta.</p>
        <p style="font-size: 28px; letter-spacing: 8px; font-weight: 700;">${code}</p>
        <p>This code expires in 10 minutes. If you did not request it, you can ignore this email.</p>
      </div>
    `,
    text: `Your Aura verification code is ${code}. It expires in 10 minutes.`,
  });
}
