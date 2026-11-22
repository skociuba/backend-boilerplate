import { Request, Response } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { parsePagination, singleQueryParam } from "../lib/queryParams";
import * as childService from "../services/childService";
import { SORTABLE_FIELDS, SortableField } from "../services/childService";

// Kontroler odpowiada tylko za warstwę HTTP: wyciąga i parsuje dane z
// req (stringi z query/body → liczby, daty, enumy), woła serwis i
// zamienia wynik na odpowiedź. Logika i zapytania są w services/.

// Pusty / brakujący parametr = brak filtra (undefined), nie NaN
function optionalInt(raw: string | undefined): number | undefined {
  return raw ? parseInt(raw) : undefined;
}

class ChildController {
  // POST /children — proste tworzenie, żeby mieć na czym ćwiczyć listing
  public create = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { name, age, date_of_birth, notes } = req.body;
    const child = await childService.createChild(req.currentUserId as number, {
      name,
      age: parseInt(age),
      date_of_birth: new Date(date_of_birth),
      notes,
    });
    res.status(201).json(child);
  });

  // GET /children?page=1&limit=10&sortBy=age&order=desc&name=ala&minAge=3&maxAge=10
  //
  // Kształt odpowiedzi: { items, pagination } — items to dane, pagination
  // to WYTYCZNE dla frontu (ile jest w sumie, czy jest kolejna strona),
  // nie duplikuje itemów w żaden sposób.
  public getIndex = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { page, limit, skip } = parsePagination(
      singleQueryParam(req.query.page),
      singleQueryParam(req.query.limit),
      { defaultLimit: 10, maxLimit: 100 }
    );

    // sortowanie — sprawdzone względem whitelisty, domyślnie po id
    const rawSortBy = singleQueryParam(req.query.sortBy);
    const sortBy: SortableField = SORTABLE_FIELDS.includes(rawSortBy as SortableField)
      ? (rawSortBy as SortableField)
      : "id";
    const order = singleQueryParam(req.query.order) === "desc" ? "desc" : "asc";

    const { items, total } = await childService.listChildren(req.currentUserId as number, {
      skip,
      take: limit,
      sortBy,
      order,
      name: singleQueryParam(req.query.name) || undefined,
      minAge: optionalInt(singleQueryParam(req.query.minAge)),
      maxAge: optionalInt(singleQueryParam(req.query.maxAge)),
    });

    // page/limit/total wystarczą — totalPages/hasNext/hasPrev to tylko
    // Math.ceil(total/limit) i dwa porównania, front może to policzyć
    // sam w jednej linijce; nie ma sensu dublować tego po stronie API
    res.status(200).json({
      items,
      pagination: { page, limit, total },
    });
  });
}

export default ChildController;
