import nodemailer from 'nodemailer'

export function emailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD && process.env.MAIL_FROM)
}

export async function sendContractSignatureEmail({ to, contractNo }) {
  if (!to || !emailConfigured()) return { status: 'queued' }
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  })
  const portalUrl = process.env.PORTAL_BASE_URL || 'http://localhost:5173'
  const result = await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject: `แจ้งลงนามสัญญาห้องพัก ${contractNo}`,
    text: `สัญญาเลขที่ ${contractNo} พร้อมให้ตรวจสอบและลงนามแล้ว กรุณาเข้าสู่ระบบ ${portalUrl}`,
    html: `<p>สัญญาเลขที่ <strong>${contractNo}</strong> พร้อมให้ตรวจสอบและลงนามแล้ว</p><p><a href="${portalUrl}">เข้าสู่ระบบ Campus Nest</a></p>`,
  })
  return { status: 'sent', messageId: result.messageId }
}
