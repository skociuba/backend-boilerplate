import * as Sentry from "@sentry/node";

// Sentry: nieoczekiwane błędy (500, wyjątki poza żądaniem) trafiają do
// panelu ze stack trace'em i wersją wydania, a przy nowym błędzie
// przychodzi mail. Bez tego o błędzie na produkcji wiedzielibyśmy dopiero
// od użytkownika albo po przekopaniu `docker logs`.
//
// Importowany w index.ts zaraz po dotenv, PRZED aplikacją — Sentry musi
// się zarejestrować, zanim załadują się moduły, które obserwuje.
// Bez SENTRY_DSN (lokalnie, w testach, w CI) nic się nie włącza.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT ?? "production",
    // Wersja obrazu (IMAGE_TAG z deployu, np. 1.2.3) — w panelu widać, od
    // którego wydania błąd się pojawił
    release: process.env.SENTRY_RELEASE,
    // Tylko błędy, bez pomiaru wydajności (tracing) — darmowy plan i tak
    // ma osobny, mały limit, a przy tym ruchu niewiele by pokazał
    tracesSampleRate: 0,
    // Sentry 11 domyślnie zbiera WSZYSTKO: ciastka (refresh token), nagłówki
    // (Authorization) i ciała żądań — a w body logowania czy zmiany hasła
    // jest hasło. Do zdiagnozowania błędu wystarczy metoda, ścieżka,
    // przeglądarka i stack trace, więc reszta jest wyłączona.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { allow: ["user-agent", "content-type", "x-request-id"] }, response: false },
      httpBodies: [],
    },
  });
}
