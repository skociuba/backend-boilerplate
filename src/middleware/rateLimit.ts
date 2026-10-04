import rateLimit from "express-rate-limit";

// Klucz throttlingu to IP (req.ip) — domyślne zachowanie express-rate-limit.
// Żeby to działało poprawnie ZA nginxem/reverse proxy (produkcja — patrz
// index.ts: app.set("trust proxy", 1)), inaczej req.ip to zawsze adres
// samego proxy, a wszyscy klienci dzieliliby jeden limit.

// Login — cel: brute-force hasła. 10 prób / 15 min / IP jest surowe
// celowo — to jest dokładnie ten endpoint, który ktoś próbowałby
// obstrzelać słownikiem haseł.
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true, // nagłówki RateLimit-* w odpowiedzi
  legacyHeaders: false,
  message: {
    error: "Zbyt wiele prób logowania. Spróbuj ponownie za 15 minut.",
  },
});

// Register — cel: spam zakładania kont, nie brute-force (nie ma tu hasła
// do zgadnięcia) — limit łagodniejszy.
export const registerRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Zbyt wiele prób rejestracji. Spróbuj ponownie za godzinę.",
  },
});
