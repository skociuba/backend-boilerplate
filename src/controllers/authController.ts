import { Request, Response } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { clearRefreshCookie, REFRESH_COOKIE_NAME, setRefreshCookie } from "../lib/refreshCookie";
import * as authService from "../services/authService";
import { TokenPair } from "../services/authService";

// Access token wraca w JSON (klient go trzyma w pamięci, dokleja do
// nagłówka) — refresh token NIGDY nie trafia do JSON-a, tylko od razu jako
// httpOnly cookie: JS po stronie klienta fizycznie nie ma jak go odczytać,
// więc nawet przy XSS atakujący nie wykradnie długożyjącego tokena, co
// dało się zrobić, gdy leciał w body i lądował w localStorage.
const sendTokens = (res: Response, tokens: TokenPair) => {
  setRefreshCookie(res, tokens.refreshToken, tokens.refreshExpiresAt);
  return { accessToken: tokens.accessToken };
};

// Refresh token przyjeżdża sam, jako ciastko (przeglądarka dokleja je
// automatycznie, bo httpOnly nie znaczy "niewysyłane", tylko
// "niedostępne dla JS")
const refreshTokenFrom = (req: Request): string | undefined => req.cookies?.[REFRESH_COOKIE_NAME];

class AuthController {
  // POST /auth/register { name, email, password } — kształt i poprawność
  // (email.email(), password min. 8 znaków) sprawdzone już WCZEŚNIEJ przez
  // validateBody(registerSchema) w routach; tu req.body jest już zaufane.
  public register = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { name, email, password } = req.body;
    const user = await authService.register({ name, email, password });

    res.status(201).json({
      user,
      // "także Spam": nadawca bez własnej domeny (Gmail SMTP) trafia u
      // części odbiorców do spamu — lepiej powiedzieć to wprost, niż
      // zostawić usera z poczuciem, że mail nie przyszedł.
      message:
        "Konto utworzone. Sprawdź maila (także folder Spam), aby je aktywować, a potem się zaloguj.",
    });
  });

  // POST /auth/login { email, password }
  public login = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { email, password } = req.body;
    const { user, tokens } = await authService.login(email, password);
    res.status(200).json({ user, ...sendTokens(res, tokens) });
  });

  // POST /auth/refresh — BEZ body, token z ciastka
  public refresh = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tokens = await authService.refresh(refreshTokenFrom(req));
    res.status(200).json(sendTokens(res, tokens));
  });

  // GET /auth/me — "kim jestem" na podstawie access tokenu (requireCurrentUser
  // w routach). Główne zastosowanie: FRONT może tu realnie zweryfikować sesję
  // przy starcie appki (RequireAuth), zamiast ufać samej obecności danych
  // w localStorage — jeśli access token jest martwy, ten request naturalnie
  // przejdzie przez cichy refresh (patrz lib/api.ts), tak jak każdy inny.
  public me = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const user = await authService.getCurrentUser(req.currentUserId as number);
    res.status(200).json({ user });
  });

  // POST /auth/logout — BEZ body, token z ciastka (jak przy refresh).
  // Access token nadal będzie działał do swojego naturalnego wygaśnięcia
  // (do 15 min) — świadomy kompromis stateless access tokenów.
  public logout = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    await authService.logout(refreshTokenFrom(req));
    clearRefreshCookie(res);
    res.status(200).json({ message: "Wylogowano" });
  });

  // POST /auth/logout-all — wymaga requireCurrentUser (musisz mieć ważny
  // access token, żeby powiedzieć "zakończ WSZYSTKIE moje sesje")
  public logoutAll = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    await authService.logoutAll(req.currentUserId as number);
    clearRefreshCookie(res);
    res.status(200).json({ message: "Wylogowano ze wszystkich urządzeń" });
  });

  // POST /auth/forgot-password { email } — ZAWSZE ta sama odpowiedź,
  // niezależnie od tego, czy taki email istnieje (user enumeration)
  public forgotPassword = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    await authService.requestPasswordReset(req.body.email);
    res.status(200).json({
      message: "Jeśli to konto istnieje, wysłaliśmy na nie link do resetu hasła.",
    });
  });

  // POST /auth/reset-password { token, password }
  public resetPassword = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { token, password } = req.body;
    await authService.resetPassword(token, password);
    res.status(200).json({ message: "Hasło zmienione. Zaloguj się ponownie." });
  });

  // POST /auth/verify-email { token }
  public verifyEmail = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    await authService.verifyEmail(req.body.token);
    res.status(200).json({ message: "Email potwierdzony" });
  });
}

export default AuthController;
