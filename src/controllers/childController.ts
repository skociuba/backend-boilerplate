import { Request, Response } from "express";
import prisma from "../db";
import { Prisma } from "../generated/prisma/client";

// Whitelist kolumn po których wolno sortować — NIGDY nie bierz nazwy
// kolumny bezpośrednio z query stringa bez sprawdzenia. Z Prismą literówka
// w nazwie i tak nie przejdzie (typowane orderBy), ale bez whitelisty
// klient mógłby sortować po czymkolwiek, co akurat wystawia model —
// niekoniecznie po tym, co chcesz udostępnić.
const SORTABLE_FIELDS = ["id", "name", "age", "date_of_birth"] as const;
type SortableField = (typeof SORTABLE_FIELDS)[number];

// req.query[klucz] w Express to string | string[] | ParsedQs | ParsedQs[] |
// undefined — NIE zawsze string. Zduplikowany parametr w URL (?limit=3&limit=5)
// staje się tablicą; poprzedni kod robił `as string` na ślepo, więc dla
// tablicy dostawał "3,5" i parseInt wyciągał z tego samo "3". Ta funkcja
// zawsze bierze OSTATNIĄ wartość (tak przyjęło się w Express/query-string —
// późniejszy wpis wygrywa) i tylko jeśli to faktycznie string.
function singleQueryParam(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return singleQueryParam(value[value.length - 1]);
  }
  return typeof value === "string" ? value : undefined;
}

class ChildController {
  // POST /children — proste tworzenie, żeby mieć na czym ćwiczyć listing
  public async create(req: Request, res: Response): Promise<void> {
    try {
      const { name, age, date_of_birth, notes } = req.body;
      const child = await prisma.children.create({
        data: {
          user_id: req.currentUserId as number,
          name,
          age: parseInt(age),
          date_of_birth: new Date(date_of_birth),
          notes,
        },
      });
      res.status(201).json(child);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  // GET /children?page=1&limit=10&sortBy=age&order=desc&name=ala&minAge=3&maxAge=10&user_id=7
  //
  // Kształt odpowiedzi: { items, pagination } — items to dane, pagination
  // to WYTYCZNE dla frontu (ile jest w sumie, czy jest kolejna strona),
  // nie duplikuje itemów w żaden sposób.
  public async getIndex(req: Request, res: Response): Promise<void> {
    try {
      const rawPage = singleQueryParam(req.query.page);
      const rawLimit = singleQueryParam(req.query.limit);
      const rawSortBy = singleQueryParam(req.query.sortBy);
      const rawOrder = singleQueryParam(req.query.order);
      const rawName = singleQueryParam(req.query.name);
      const rawMinAge = singleQueryParam(req.query.minAge);
      const rawMaxAge = singleQueryParam(req.query.maxAge);

      // paginacja — offset-based (page/limit), najprostszy wariant.
      // Math.max/min to "clamp": źle podany page/limit nie wywala błędu,
      // tylko ląduje w sensownych granicach (strona 1, limit 1..100)
      const page = Math.max(1, parseInt(rawPage as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(rawLimit as string) || 10));
      const skip = (page - 1) * limit;

      // sortowanie — sprawdzone względem whitelisty, domyślnie po id
      const sortBy: SortableField = SORTABLE_FIELDS.includes(
        rawSortBy as SortableField
      )
        ? (rawSortBy as SortableField)
        : "id";
      const order: "asc" | "desc" = rawOrder === "desc" ? "desc" : "asc";

      // filtrowanie — budujemy warunek WHERE tylko z parametrów, które
      // faktycznie przyszły w query; brak parametru = brak filtra.
      // user_id NIE jest parametrem query — to "moje dzieci", więc zakres
      // wymusza sam backend z req.currentUserId, nie da się go rozszerzyć
      // przez query string na cudze dzieci.
      const where: Prisma.childrenWhereInput = {
        user_id: req.currentUserId as number,
      };

      if (rawName) {
        where.name = {
          contains: rawName,
          mode: "insensitive", // "Ala" znajdzie też "ala", "ALA"
        };
      }
      if (rawMinAge || rawMaxAge) {
        where.age = {
          ...(rawMinAge ? { gte: parseInt(rawMinAge) } : {}),
          ...(rawMaxAge ? { lte: parseInt(rawMaxAge) } : {}),
        };
      }

      // count + findMany w jednej transakcji — oba zapytania widzą ten sam,
      // spójny stan bazy (bez tego, przy zapisie między nimi, total i
      // faktyczna liczba zwróconych wierszy mogłyby się rozjechać)
      const [items, total] = await prisma.$transaction([
        prisma.children.findMany({
          where,
          orderBy: { [sortBy]: order },
          skip,
          take: limit,
        }),
        prisma.children.count({ where }),
      ]);

      // page/limit/total wystarczą — totalPages/hasNext/hasPrev to tylko
      // Math.ceil(total/limit) i dwa porównania, front może to policzyć
      // sam w jednej linijce; nie ma sensu dublować tego po stronie API
      res.status(200).json({
        items,
        pagination: {
          page,
          limit,
          total,
        },
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
}

export default ChildController;
