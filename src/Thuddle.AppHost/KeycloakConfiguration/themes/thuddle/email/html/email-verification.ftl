<#assign kcBodyContent>
  <h2 style="margin:0 0 16px; font-size:22px; font-weight:600; color:#111827;">Verify your email</h2>
  <p style="margin:0 0 24px; font-size:15px; color:#4b5563; line-height:1.6;">
    Welcome to Thuddle! Please verify your email address by clicking the button below.
  </p>
  <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
    <tr>
      <td style="background-color:#4f46e5; border-radius:8px;">
        <a href="${link}" style="display:inline-block; padding:12px 32px; font-size:15px; font-weight:600; color:#ffffff; text-decoration:none;">
          Verify Email Address
        </a>
      </td>
    </tr>
  </table>
  <p style="margin:0 0 8px; font-size:13px; color:#9ca3af; line-height:1.5;">
    If the button doesn't work, copy and paste this link into your browser:
  </p>
  <p style="margin:0; font-size:13px; color:#6366f1; word-break:break-all; line-height:1.5;">
    ${link}
  </p>
  <p style="margin:24px 0 0; font-size:13px; color:#9ca3af; line-height:1.5;">
    This link will expire in ${linkExpirationFormatter(linkExpiration)}.
  </p>
</#assign>
<#include "template.ftl">
