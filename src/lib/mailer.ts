import nodemailer, { Transporter } from "nodemailer";
import logger from "./logger";

// JEDYNE miejsce w aplikacji, które wie JAK wysłać maila. Reszta kodu
// (authController) tylko woła sendActivationEmail/sendPasswordResetEmail —
// nie wie i nie musi wiedzieć, czy to Ethereal czy prawdziwy dostawca.
//
// Bez SMTP_HOST w .env: tworzymy JEDNORAZOWE, darmowe konto testowe na
// ethereal.email — maile NIGDZIE realnie nie trafiają, tylko lądują w
// podglądzie, na który link wypisujemy w konsoli backendu. To standardowy
// sposób na testowanie wysyłki maili bez posiadania żadnej skrzynki.
//
// Z SMTP_HOST wypełnionym: identyczny kod, inny transporter — Resend,
// SendGrid, Mailgun, AWS SES i każdy inny dostawca wystawiają SMTP, nie
// tylko własne REST API. Zmienia się WYŁĄCZNIE ta funkcja, nic więcej
// w całej aplikacji.
let transporterPromise: Promise<Transporter> | null = null;

const getTransporter = (): Promise<Transporter> => {
  if (!transporterPromise) {
    transporterPromise = (async () => {
      if (process.env.SMTP_HOST) {
        return nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT) || 587,
          auth: process.env.SMTP_USER
            ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
            : undefined,
        });
      }

      const testAccount = await nodemailer.createTestAccount();
      logger.info(
        { etherealUser: testAccount.user },
        "Brak SMTP_HOST — wysyłka maili przez jednorazowe konto testowe Ethereal"
      );

      return nodemailer.createTransport({
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        auth: { user: testAccount.user, pass: testAccount.pass },
      });
    })();
  }

  return transporterPromise;
};

type Email = { subject: string; html: string; text: string };

const sendMail = async (to: string, { subject, html, text }: Email): Promise<void> => {
  const transporter = await getTransporter();
  // text obok html: sam HTML z jednym linkiem to wzorzec, za który filtry
  // antyspamowe (Gmail) odejmują punkty — prawdziwe maile transakcyjne
  // zawsze wysyłają obie wersje (multipart/alternative).
  const info = await transporter.sendMail({
    from: process.env.EMAIL_FROM || "no-reply@example.com",
    to,
    subject,
    html,
    text,
  });

  // Bez tego udana wysyłka przez prawdziwego dostawcę nie zostawiała w
  // logach ŻADNEGO śladu — nie dało się odróżnić "wysłane, utknęło w spamie"
  // od "nic nie poszło". messageId + odpowiedź serwera wystarczą, żeby
  // znaleźć maila u dostawcy; adresu odbiorcy celowo nie logujemy (dane
  // osobowe w logach).
  logger.info({ subject, messageId: info.messageId, response: info.response }, "Mail wysłany");

  // getTestMessageUrl zwraca URL TYLKO dla transportera Etherala — dla
  // prawdziwego dostawcy wraca null, i to jest poprawne (nie ma czego
  // podglądać, mail poszedł realnie).
  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    logger.info({ previewUrl }, "Podgląd maila (Ethereal)");
  }
};

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3001";
const APP_NAME = "VPS2";

// Jeden szablon na wszystkie maile: powitanie, powód, przycisk, link
// tekstem (gdyby klient pocztowy nie pokazał przycisku) i stopka "jeśli to
// nie Ty". Treść, która wygląda jak normalna korespondencja, a nie jak
// goły link, to drugi po reputacji nadawcy czynnik, który decyduje o spamie.
//
// target="_blank" — bez tego podglądy maili, które renderują treść w
// <iframe> (MailDev, Ethereal), nawigowałyby TEN iframe, nie całą
// przeglądarkę — klik wyglądałby jak "strona otwiera się wewnątrz maila".
const buildEmail = ({
  subject,
  intro,
  action,
  link,
  expiry,
  ignoreNote,
}: {
  subject: string;
  intro: string;
  action: string;
  link: string;
  expiry: string;
  ignoreNote: string;
}): Email => ({
  subject: `${subject} — ${APP_NAME}`,
  html: `<!doctype html>
<html lang="pl">
  <body style="margin:0;padding:24px;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2933;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:8px;">
      <tr><td style="padding:32px;">
        <h1 style="margin:0 0 16px;font-size:20px;">${APP_NAME}</h1>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">Cześć,</p>
        <p style="margin:0 0 24px;font-size:15px;line-height:1.5;">${intro}</p>
        <p style="margin:0 0 24px;">
          <a href="${link}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 20px;background:#1f3a5f;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;">${action}</a>
        </p>
        <p style="margin:0 0 8px;font-size:13px;color:#52606d;">Jeśli przycisk nie działa, skopiuj ten adres do przeglądarki:</p>
        <p style="margin:0 0 24px;font-size:13px;word-break:break-all;"><a href="${link}" target="_blank" rel="noopener">${link}</a></p>
        <p style="margin:0;font-size:13px;color:#52606d;">${expiry} ${ignoreNote}</p>
      </td></tr>
    </table>
  </body>
</html>`,
  text: `Cześć,

${intro}

${action}: ${link}

${expiry} ${ignoreNote}

— ${APP_NAME}`,
});

export const sendActivationEmail = (to: string, token: string): Promise<void> =>
  sendMail(
    to,
    buildEmail({
      subject: "Potwierdź swój adres email",
      intro: `Dziękujemy za rejestrację w ${APP_NAME}. Potwierdź, że ten adres należy do Ciebie, a potem zaloguj się.`,
      action: "Aktywuj konto",
      link: `${FRONTEND_URL}/activate?token=${token}`,
      expiry: "Link jest ważny 24 godziny.",
      ignoreNote: "Jeśli to nie Ty zakładałeś konto, zignoruj tę wiadomość.",
    })
  );

export const sendPasswordResetEmail = (to: string, token: string): Promise<void> =>
  sendMail(
    to,
    buildEmail({
      subject: "Reset hasła",
      intro: `Ktoś poprosił o ustawienie nowego hasła do Twojego konta w ${APP_NAME}.`,
      action: "Ustaw nowe hasło",
      link: `${FRONTEND_URL}/reset-password?token=${token}`,
      expiry: "Link jest ważny godzinę.",
      ignoreNote: "Jeśli to nie Ty, zignoruj tę wiadomość — hasło się nie zmieni.",
    })
  );

// Ten sam link/endpoint co reset hasła (/reset-password, purpose:
// password_reset) — konto admin-utworzone (POST /users) nie ma JESZCZE
// żadnego hasła, więc "resetowanie" to w praktyce "ustawianie po raz
// pierwszy". Ta sama akcja po stronie backendu (authController.resetPassword),
// inny tylko tekst maila, żeby nie mylić usera "zresetuj" ze "ustaw".
export const sendAccountSetupEmail = (to: string, token: string): Promise<void> =>
  sendMail(
    to,
    buildEmail({
      subject: "Twoje konto zostało utworzone",
      intro: `Administrator utworzył dla Ciebie konto w ${APP_NAME}. Ustaw hasło, żeby móc się zalogować.`,
      action: "Ustaw hasło",
      link: `${FRONTEND_URL}/reset-password?token=${token}`,
      expiry: "Link jest ważny godzinę.",
      ignoreNote: "Jeśli nie spodziewałeś się tej wiadomości, zignoruj ją.",
    })
  );
