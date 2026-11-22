import prisma from "../db";
import { Prisma } from "../generated/prisma/client";

// Warstwa serwisu: logika biznesowa + zapytania do Prismy. Celowo NIE zna
// Expressa (żadnego req/res) — dostaje już sparsowane, typowane argumenty.
// Dzięki temu da się jej użyć poza HTTP (skrypty, joby, seed) i testować
// ją bez budowania fałszywych obiektów Request/Response.

// Whitelist kolumn po których wolno sortować — NIGDY nie bierz nazwy
// kolumny bezpośrednio z query stringa bez sprawdzenia. Z Prismą literówka
// w nazwie i tak nie przejdzie (typowane orderBy), ale bez whitelisty
// klient mógłby sortować po czymkolwiek, co akurat wystawia model —
// niekoniecznie po tym, co chcesz udostępnić.
export const SORTABLE_FIELDS = ["id", "name", "age", "date_of_birth"] as const;
export type SortableField = (typeof SORTABLE_FIELDS)[number];

export interface CreateChildInput {
  name: string;
  age: number;
  date_of_birth: Date;
  notes?: string;
}

export interface ListChildrenOptions {
  skip: number;
  take: number;
  sortBy: SortableField;
  order: "asc" | "desc";
  name?: string;
  minAge?: number;
  maxAge?: number;
}

// userId jako osobny argument, nie pole w input — właściciel zawsze
// pochodzi z uwierzytelnionej sesji, nigdy z danych od klienta
export function createChild(userId: number, input: CreateChildInput) {
  return prisma.children.create({
    data: { user_id: userId, ...input },
  });
}

export async function listChildren(userId: number, options: ListChildrenOptions) {
  const { skip, take, sortBy, order, name, minAge, maxAge } = options;

  // filtrowanie — warunek WHERE tylko z parametrów, które faktycznie
  // przyszły; brak parametru = brak filtra. user_id wymuszony zawsze:
  // to "moje dzieci", zakresu nie da się rozszerzyć na cudze dzieci.
  const where: Prisma.childrenWhereInput = { user_id: userId };

  if (name) {
    where.name = {
      contains: name,
      mode: "insensitive", // "Ala" znajdzie też "ala", "ALA"
    };
  }
  if (minAge !== undefined || maxAge !== undefined) {
    where.age = {
      ...(minAge !== undefined ? { gte: minAge } : {}),
      ...(maxAge !== undefined ? { lte: maxAge } : {}),
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
      take,
    }),
    prisma.children.count({ where }),
  ]);

  return { items, total };
}
