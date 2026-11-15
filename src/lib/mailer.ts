import nodemailer, { Transporter } from "nodemailer";

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
      console.log(
        `📧 Brak SMTP_HOST — wysyłka maili przez jednorazowe konto testowe Ethereal (user: ${testAccount.user})`
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

const sendMail = async (to: string, subject: string, html: string): Promise<void> => {
  const transporter = await getTransporter();
  const info = await transporter.sendMail({
    from: process.env.EMAIL_FROM || "no-reply@example.com",
    to,
    subject,
    html,
  });

  // getTestMessageUrl zwraca URL TYLKO dla transportera Etherala — dla
  // prawdziwego dostawcy wraca null, i to jest poprawne (nie ma czego
  // podglądać, mail poszedł realnie).
  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    console.log(`📧 Podgląd maila (Ethereal): ${previewUrl}`);
  }
};

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3001";

// target="_blank" — bez tego podglądy maili, które renderują treść w
// <iframe> (MailDev, Ethereal), nawigowałyby TEN iframe, nie całą
// przeglądarkę — klik wyglądałby jak "strona otwiera się wewnątrz maila".
// Realny klient pocztowy i tak zawsze otwiera linki w nowej karcie/oknie,
// niezależnie od tego atrybutu — to głównie dla zgodności z podglądami.
export const sendActivationEmail = (to: string, token: string): Promise<void> => {
  const link = `${FRONTEND_URL}/activate?token=${token}`;
  return sendMail(
    to,
    "Potwierdź swój adres email",
    `<p>Kliknij link, aby aktywować konto:</p><p><a href="${link}" target="_blank" rel="noopener">${link}</a></p>`
  );
};

export const sendPasswordResetEmail = (to: string, token: string): Promise<void> => {
  const link = `${FRONTEND_URL}/reset-password?token=${token}`;
  return sendMail(
    to,
    "Reset hasła",
    `<p>Kliknij link, aby ustawić nowe hasło (link wygasa za godzinę):</p><p><a href="${link}" target="_blank" rel="noopener">${link}</a></p>`
  );
};

// Ten sam link/endpoint co reset hasła (/reset-password, purpose:
// password_reset) — konto admin-utworzone (POST /users) nie ma JESZCZE
// żadnego hasła, więc "resetowanie" to w praktyce "ustawianie po raz
// pierwszy". Ta sama akcja po stronie backendu (authController.resetPassword),
// inny tylko tekst maila, żeby nie mylić usera "zresetuj" ze "ustaw".
export const sendAccountSetupEmail = (to: string, token: string): Promise<void> => {
  const link = `${FRONTEND_URL}/reset-password?token=${token}`;
  return sendMail(
    to,
    "Twoje konto zostało utworzone",
    `<p>Administrator utworzył dla Ciebie konto. Kliknij link, aby ustawić hasło i móc się
    zalogować (link wygasa za godzinę):</p><p><a href="${link}" target="_blank" rel="noopener">${link}</a></p>`
  );
};
