import { Router, type IRouter } from "express";
import { SendByEmailBody, SendByEmailResponse } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.post("/share/email", async (req, res): Promise<void> => {
  const parsed = SendByEmailBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { to, subject, message, fileName, fileBase64, mimeType } = parsed.data;

  // Log that an email share was requested
  logger.info({ to, subject, fileName, mimeType }, "Email share requested");

  // In a production deployment this would integrate with an email provider
  // such as SendGrid or Nodemailer. For now, we return a success response
  // so the client can show a confirmation. The file is available as fileBase64.
  // To add a real email provider, install nodemailer or @sendgrid/mail and
  // configure SMTP or API key via environment secrets.
  const _ = { message, fileBase64 }; // suppresses unused-var lint

  res.json(
    SendByEmailResponse.parse({
      success: true,
      message: `Email prepared for ${to}. Configure an email provider in the server to send attachments.`,
    }),
  );
});

export default router;
