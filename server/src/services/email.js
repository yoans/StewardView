const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_ADDRESS = process.env.EMAIL_FROM || 'StewardView <noreply@stewardview.app>';

async function sendMfaCode(toEmail, code) {
  await resend.emails.send({
    from: FROM_ADDRESS,
    to: toEmail,
    subject: 'StewardView — Your verification code',
    html: `
      <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1e3a5f;">StewardView Login</h2>
        <p>Your verification code is:</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 6px; text-align: center;
                    padding: 16px; background: #f3f4f6; border-radius: 8px; margin: 16px 0;">
          ${code}
        </div>
        <p style="color: #6b7280; font-size: 14px;">
          This code expires in 10 minutes. If you didn't request this, ignore this email.
        </p>
      </div>
    `,
  });
}

module.exports = { sendMfaCode };
