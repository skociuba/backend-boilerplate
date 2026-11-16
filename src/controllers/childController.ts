import { Request, Response } from "express";
import prisma from "../db";
import { Prisma } from "../generated/prisma/client";
import { asyncHandler } from "../lib/asyncHandler";
import { parsePagination, singleQueryParam } from "../lib/queryParams";

// Whitelist kolumn po których wolno sortować — NIGDY nie bierz nazwy
// kolumny bezpośrednio z query stringa bez sprawdzenia. Z Prismą literówka
// w nazwie i tak nie przejdzie (typowane orderBy), ale bez whitelisty
// klient mógłby sortować po czymkolwiek, co akurat wystawia model —
// niekoniecznie po tym, co chcesz udostępnić.
const SORTABLE_FIELDS = ["id", "name", "age", "date_of_birth"] as const;
type SortableField = (typeof SORTABLE_FIELDS)[number];

class ChildController {
  // POST /children — proste tworzenie, żeby mieć na czym ćwiczyć listing
  public create = asyncHandler(async (req: Request, res: Response): Promise<void> => {
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
  });

  // GET /children?page=1&limit=10&sortBy=age&order=desc&name=ala&minAge=3&maxAge=10&user_id=7
  //
  // Kształt odpowiedzi: { items, pagination } — items to dane, pagination
  // to WYTYCZNE dla frontu (ile jest w sumie, czy jest kolejna strona),
  // nie duplikuje itemów w żaden sposób.
  public getIndex = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const rawPage = singleQueryParam(req.query.page);
    const rawLimit = singleQueryParam(req.query.limit);
    const rawSortBy = singleQueryParam(req.query.sortBy);
    const rawOrder = singleQueryParam(req.query.order);
    const rawName = singleQueryParam(req.query.name);
    const rawMinAge = singleQueryParam(req.query.minAge);
    const rawMaxAge = singleQueryParam(req.query.maxAge);

    const { page, limit, skip } = parsePagination(rawPage, rawLimit, {
      defaultLimit: 10,
      maxLimit: 100,
    });

    // sortowanie — sprawdzone względem whitelisty, domyślnie po id
    const sortBy: SortableField = SORTABLE_FIELDS.includes(rawSortBy as SortableField)
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
  });
}

export default ChildController;
