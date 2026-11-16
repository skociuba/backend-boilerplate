-- Opcjonalne zdjęcie posta. Kolumna nullable bez wartości domyślnej, więc
-- istniejące posty dostają NULL, a ALTER nie przepisuje tabeli.
ALTER TABLE "posts" ADD COLUMN "image_path" TEXT;
