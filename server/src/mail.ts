import { createTransport, type Transporter } from "nodemailer";

import { env } from "./env";

let transporter: Transporter | null = null;

const getTransporter = () => {
  if (!env.SMTP_HOST) {
    return null;
  }
  if (!transporter) {
    transporter = createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT ?? 587,
      secure: env.SMTP_SECURE === "true",
      auth:
        env.SMTP_USER && env.SMTP_PASS
          ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
          : undefined,
    });
  }
  return transporter;
};

export const sendMail = async ({
  to,
  subject,
  text,
  html,
}: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}) => {
  const transport = getTransporter();
  if (!transport) {
    // eslint-disable-next-line no-console
    console.log(
      `\n[mail:dev] SMTP not configured. To: ${to}\nSubject: ${subject}\n${text}\n`,
    );
    return;
  }

  await transport.sendMail({
    from: env.SMTP_FROM ?? env.SMTP_USER,
    to,
    subject,
    text,
    html,
  });
};
