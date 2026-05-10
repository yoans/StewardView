const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_ADDRESS = process.env.EMAIL_FROM || 'StewardView <noreply@stewardview.com>';

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

async function sendPasswordResetEmail(toEmail, resetUrl) {
  await resend.emails.send({
    from: FROM_ADDRESS,
    to: toEmail,
    subject: 'StewardView — Reset your password',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1e3a5f;">Reset your StewardView password</h2>
        <p>We received a request to reset your password.</p>
        <p style="margin: 24px 0;">
          <a href="${resetUrl}" style="background: #1d4ed8; color: white; padding: 12px 18px;
             border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
            Reset Password
          </a>
        </p>
        <p style="color: #374151; font-size: 14px;">This link expires in 30 minutes.</p>
        <p style="color: #6b7280; font-size: 14px;">
          If you did not request a password reset, you can safely ignore this email.
        </p>
      </div>
    `,
  });
}

async function sendUserInviteEmail(toEmail, setupUrl, inviterName, organizationName) {
  await resend.emails.send({
    from: FROM_ADDRESS,
    to: toEmail,
    subject: `StewardView — Set up your ${organizationName || 'organization'} account`,
    html: `
      <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1e3a5f;">You're invited to StewardView</h2>
        <p>${inviterName || 'An administrator'} invited you to join ${organizationName || 'their organization'} in StewardView.</p>
        <p>Use this secure link to choose your password. Your account will remain pending until an admin approves access.</p>
        <p style="margin: 24px 0;">
          <a href="${setupUrl}" style="background: #1d4ed8; color: white; padding: 12px 18px;
             border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
            Set Up Account
          </a>
        </p>
        <p style="color: #374151; font-size: 14px;">This link expires in 7 days.</p>
        <p style="color: #6b7280; font-size: 14px;">
          If you were not expecting this invitation, you can safely ignore this email.
        </p>
      </div>
    `,
  });
}

module.exports = { sendMfaCode, sendPasswordResetEmail, sendUserInviteEmail };
