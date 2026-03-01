const nodemailer = require('nodemailer');
const { Readable } = require('stream');

// Vercel serverless functions with body parsing disabled receive raw body
// We need to parse multipart/form-data manually
module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const { fields, files } = await parseMultipart(req);

    // Honeypot check
    if (fields.botcheck) {
      return res.status(200).json({ success: false, message: 'Bot detected' });
    }

    // Required field validation
    const formType = fields.form_type || 'customer';
    const requiredFields = formType === 'supplier'
      ? ['company', 'contact_person', 'email', 'products']
      : ['company', 'name', 'email', 'product'];

    for (const field of requiredFields) {
      if (!fields[field] || !fields[field].trim()) {
        return res.status(400).json({
          success: false,
          message: `Missing required field: ${field}`
        });
      }
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(fields.email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email address'
      });
    }

    // Build email
    const subject = formType === 'supplier'
      ? `Neue Supplier-Bewerbung: ${fields.company}`
      : `Neue Produktanfrage: ${fields.company}`;

    const htmlBody = formType === 'supplier'
      ? buildSupplierEmail(fields)
      : buildCustomerEmail(fields);

    // Prepare attachments from uploaded files
    const attachments = [];
    for (const [fieldName, file] of Object.entries(files)) {
      attachments.push({
        filename: file.filename,
        content: file.buffer,
        contentType: file.contentType
      });
    }

    // Send email via Zoho SMTP
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.zoho.eu',
      port: parseInt(process.env.SMTP_PORT || '465', 10),
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    await transporter.sendMail({
      from: `"HAQ Botanicals Website" <${process.env.SMTP_USER}>`,
      to: formType === 'supplier'
        ? (process.env.SUPPLIER_EMAIL || 'purchasing@haq-botanicals.de')
        : (process.env.CONTACT_EMAIL || 'info@haq-botanicals.de'),
      replyTo: fields.email,
      subject: subject,
      html: htmlBody,
      attachments: attachments
    });

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Contact form error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error. Please try again later.'
    });
  }
};

// Disable Vercel's default body parser so we can handle multipart ourselves
module.exports.config = {
  api: {
    bodyParser: false
  }
};

/**
 * Parse multipart/form-data from the raw request
 */
async function parseMultipart(req) {
  const fields = {};
  const files = {};

  const contentType = req.headers['content-type'] || '';

  // Handle URL-encoded forms (fallback)
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const body = await getRawBody(req);
    const params = new URLSearchParams(body);
    for (const [key, value] of params) {
      fields[key] = value;
    }
    return { fields, files };
  }

  // Handle JSON body (fallback)
  if (contentType.includes('application/json')) {
    const body = await getRawBody(req);
    const parsed = JSON.parse(body);
    for (const [key, value] of Object.entries(parsed)) {
      fields[key] = String(value);
    }
    return { fields, files };
  }

  // Handle multipart/form-data
  if (!contentType.includes('multipart/form-data')) {
    throw new Error('Unsupported content type: ' + contentType);
  }

  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^\s;]+))/);
  if (!boundaryMatch) {
    throw new Error('No boundary found in content type');
  }
  const boundary = boundaryMatch[1] || boundaryMatch[2];

  const rawBody = await getRawBodyBuffer(req);
  const boundaryBuffer = Buffer.from('--' + boundary);
  const parts = splitBuffer(rawBody, boundaryBuffer);

  for (const part of parts) {
    // Skip empty parts and closing boundary
    const partStr = part.toString('utf-8', 0, Math.min(part.length, 500));
    if (partStr.trim() === '' || partStr.trim() === '--') continue;

    // Find header/body separator (double CRLF)
    const separatorIndex = bufferIndexOf(part, Buffer.from('\r\n\r\n'));
    if (separatorIndex === -1) continue;

    const headerSection = part.slice(0, separatorIndex).toString('utf-8');
    // Body starts after \r\n\r\n and ends before trailing \r\n
    let body = part.slice(separatorIndex + 4);
    if (body.length >= 2 && body[body.length - 2] === 0x0d && body[body.length - 1] === 0x0a) {
      body = body.slice(0, body.length - 2);
    }

    const nameMatch = headerSection.match(/name="([^"]+)"/);
    if (!nameMatch) continue;
    const name = nameMatch[1];

    const filenameMatch = headerSection.match(/filename="([^"]*)"/);
    if (filenameMatch && filenameMatch[1]) {
      // File field
      const filename = filenameMatch[1];
      const ctMatch = headerSection.match(/Content-Type:\s*(.+)/i);
      const fileContentType = ctMatch ? ctMatch[1].trim() : 'application/octet-stream';
      files[name] = {
        filename: filename,
        contentType: fileContentType,
        buffer: body
      };
    } else {
      // Regular field
      fields[name] = body.toString('utf-8');
    }
  }

  return { fields, files };
}

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function getRawBodyBuffer(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function bufferIndexOf(buf, search) {
  for (let i = 0; i <= buf.length - search.length; i++) {
    let found = true;
    for (let j = 0; j < search.length; j++) {
      if (buf[i + j] !== search[j]) {
        found = false;
        break;
      }
    }
    if (found) return i;
  }
  return -1;
}

function splitBuffer(buf, delimiter) {
  const parts = [];
  let start = 0;
  while (start < buf.length) {
    const idx = bufferIndexOf(buf.slice(start), delimiter);
    if (idx === -1) {
      parts.push(buf.slice(start));
      break;
    }
    if (idx > 0) {
      parts.push(buf.slice(start, start + idx));
    }
    start = start + idx + delimiter.length;
  }
  return parts;
}

/**
 * Build HTML email for customer inquiries
 */
function buildCustomerEmail(fields) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #1a4d2e; color: white; padding: 20px; text-align: center;">
        <h1 style="margin: 0; font-size: 20px;">Neue Produktanfrage</h1>
      </div>
      <div style="padding: 20px; background: #f9f9f9;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #ddd; font-weight: bold; width: 40%;">Firma</td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;">${escapeHtml(fields.company)}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #ddd; font-weight: bold;">Name</td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;">${escapeHtml(fields.name)}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #ddd; font-weight: bold;">E-Mail</td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;"><a href="mailto:${escapeHtml(fields.email)}">${escapeHtml(fields.email)}</a></td>
          </tr>
          ${fields.phone ? `<tr>
            <td style="padding: 10px; border-bottom: 1px solid #ddd; font-weight: bold;">Telefon</td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;">${escapeHtml(fields.phone)}</td>
          </tr>` : ''}
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #ddd; font-weight: bold;">Gesuchter Rohstoff</td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;">${escapeHtml(fields.product)}</td>
          </tr>
          ${fields.annual_volume ? `<tr>
            <td style="padding: 10px; border-bottom: 1px solid #ddd; font-weight: bold;">Jahresbedarf (kg)</td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;">${escapeHtml(fields.annual_volume)}</td>
          </tr>` : ''}
          ${fields.requirements ? `<tr>
            <td style="padding: 10px; border-bottom: 1px solid #ddd; font-weight: bold;">Anforderungen</td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;">${escapeHtml(fields.requirements)}</td>
          </tr>` : ''}
        </table>
        <p style="margin-top: 20px; font-size: 12px; color: #888;">
          Datenschutz-Einwilligung erteilt: ${fields.privacy_consent ? 'Ja' : 'Nein'}
        </p>
      </div>
    </div>`;
}

/**
 * Build HTML email for supplier applications
 */
function buildSupplierEmail(fields) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #1a4d2e; color: white; padding: 20px; text-align: center;">
        <h1 style="margin: 0; font-size: 20px;">Neue Supplier-Bewerbung</h1>
      </div>
      <div style="padding: 20px; background: #f9f9f9;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #ddd; font-weight: bold; width: 40%;">Company</td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;">${escapeHtml(fields.company)}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #ddd; font-weight: bold;">Contact Person</td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;">${escapeHtml(fields.contact_person)}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #ddd; font-weight: bold;">Email</td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;"><a href="mailto:${escapeHtml(fields.email)}">${escapeHtml(fields.email)}</a></td>
          </tr>
          ${fields.website ? `<tr>
            <td style="padding: 10px; border-bottom: 1px solid #ddd; font-weight: bold;">Website</td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;"><a href="${escapeHtml(fields.website)}">${escapeHtml(fields.website)}</a></td>
          </tr>` : ''}
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #ddd; font-weight: bold;">Products</td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;">${escapeHtml(fields.products)}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #ddd; font-weight: bold;">Compliance</td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;">
              GMP (ISO 22716): ${fields.compliance_gmp ? 'Yes' : 'No'}<br>
              TRACES NT COI: ${fields.compliance_traces ? 'Yes' : 'No'}<br>
              No Animal Testing: ${fields.compliance_animal ? 'Yes' : 'No'}
            </td>
          </tr>
          ${fields.comments ? `<tr>
            <td style="padding: 10px; border-bottom: 1px solid #ddd; font-weight: bold;">Comments</td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;">${escapeHtml(fields.comments)}</td>
          </tr>` : ''}
        </table>
        <p style="margin-top: 20px; font-size: 12px; color: #888;">
          Privacy consent given: ${fields.privacy_consent ? 'Yes' : 'No'}
        </p>
      </div>
    </div>`;
}

/**
 * Escape HTML to prevent XSS in email content
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
