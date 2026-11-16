// req.query[klucz] w Express to string | string[] | ParsedQs | ParsedQs[] |
// undefined — NIE zawsze string. Zduplikowany parametr w URL (?limit=3&limit=5)
// staje się tablicą; `as string` na ślepo dawało "3,5" i parseInt wyciągał
// z tego samo "3". Ta funkcja zawsze bierze OSTATNIĄ wartość (tak przyjęło
// się w Express/query-string — późniejszy wpis wygrywa) i tylko jeśli to
// faktycznie string. Wspólna dla wszystkich list z paginacją (dzieci, posty).
export function singleQueryParam(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return singleQueryParam(value[value.length - 1]);
  }
  return typeof value === "string" ? value : undefined;
}

// Offset-based page/limit z "clampem": źle podany page/limit nie wywala
// błędu, tylko ląduje w sensownych granicach (strona >= 1, limit 1..max).
export function parsePagination(
  rawPage: string | undefined,
  rawLimit: string | undefined,
  { defaultLimit, maxLimit }: { defaultLimit: number; maxLimit: number }
) {
  const page = Math.max(1, parseInt(rawPage as string) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(rawLimit as string) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}
