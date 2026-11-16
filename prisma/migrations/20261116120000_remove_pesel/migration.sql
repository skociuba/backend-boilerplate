-- PESEL usunięty: publiczna aplikacja demonstracyjna nie ma podstawy, żeby
-- go zbierać (RODO, minimalizacja danych). DROP COLUMN kasuje też już
-- zapisane numery — to zamierzone, bo nie chcemy ich dalej przechowywać.
-- Bez osobnego DROP INDEX: unikalność pesel to na produkcji indeks, a w
-- starszych bazach (sprzed Prismy) constraint — Postgres usuwa jedno i
-- drugie razem z kolumną, więc ta sama migracja działa w obu przypadkach.
--
-- Data urodzenia opcjonalna, żeby dało się zapisać profil (imię i nazwisko,
-- telefon, avatar) bez podawania danych, których aplikacja nie potrzebuje.
ALTER TABLE "user_profiles" DROP COLUMN "pesel",
ALTER COLUMN "date_of_birth" DROP NOT NULL;
