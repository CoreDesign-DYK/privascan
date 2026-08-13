import { Router, type IRouter } from "express";
import { SendByEmailBody, SendByEmailResponse } from "@workspace/api-zod";
import { logger } from "../lib/logger";
import nodemailer from "nodemailer";

const router: IRouter = Router();

function createTransport() {
  const host = process.env["SMTP_HOST"];
  const port = Number(process.env["SMTP_PORT"] ?? "587");
  const user = process.env["SMTP_USER"];
  const pass = process.env["SMTP_PASS"];

  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

router.post("/share/email", async (req, res): Promise<void> => {
  const parsed = SendByEmailBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { to, subject, message, fileName, fileBase64, mimeType } = parsed.data;
  logger.info({ to, subject, fileName, mimeType }, "Email share requested");

  const transport = createTransport();

  if (!transport) {
    // SMTP not configured — inform the client clearly
    res.status(503).json({
      success: false,
      message: "Email sending is not configured on this server. Set SMTP_HOST, SMTP_USER, SMTP_PASS, and SMTP_PORT environment secrets.",
    });
    return;
  }

  try {
    const from = process.env["SMTP_FROM"] ?? process.env["SMTP_USER"];
    await transport.sendMail({
      from,
      to,
      subject: subject ?? `PrivaScan — ${fileName}`,
      text: message ?? "Please find your scanned document attached.",
      attachments: [
        {
          filename: fileName,
          content: Buffer.from(fileBase64, "base64"),
          contentType: mimeType,
        },
      ],
    });

    res.json(SendByEmailResponse.parse({ success: true, message: `Email sent to ${to}` }));
  } catch (err) {
    logger.error({ err }, "Failed to send email");
    res.status(500).json({ success: false, message: "Failed to send email. Check server SMTP configuration." });
  }
});

export default router;
