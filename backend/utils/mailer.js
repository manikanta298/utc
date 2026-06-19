const https = require('https');

const sendMail = async ({ to, subject, html }) => {
  const apiKey = process.env.BREVO_API_KEY;

  if (!apiKey) {
    throw new Error('BREVO_API_KEY not set in Render environment variables.');
  }

  const payload = JSON.stringify({
    sender: { name: 'UTC Café', email: process.env.BREVO_SENDER || 'manikantakambala12@gmail.com' },
    to: [{ email: to }],
    subject,
    htmlContent: html,
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.brevo.com',
      path: '/v3/smtp/email',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        const parsed = JSON.parse(data);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log('[Mailer] ✅ Email sent via Brevo API | MessageId:', parsed.messageId);
          resolve(parsed);
        } else {
          console.error('[Mailer] ❌ Brevo API error:', parsed);
          reject(new Error(parsed.message || 'Brevo API failed'));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
};

module.exports = { sendMail };
