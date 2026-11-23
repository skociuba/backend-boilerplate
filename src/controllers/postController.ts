import { Request, Response } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { BadRequestError, ForbiddenError } from "../lib/errors";
import { parsePagination, singleQueryParam } from "../lib/queryParams";
import * as postService from "../services/postService";
import { SORTABLE_FIELDS, SortableField } from "../services/postService";

// Dłuższa fraza nic nie znajdzie, a ILIKE po długim wzorcu na każdym
// wierszu to niepotrzebny koszt — przycinamy zamiast odrzucać zapytanie.
const MAX_SEARCH_LENGTH = 100;

// Trasy zapisu mają requireCurrentUser, więc currentUserId jest ustawione
const actorId = (req: Request) => req.currentUserId as number;
const postId = (req: Request) => parseInt(req.params.id);

class PostController {
  // GET /posts?page=1&limit=9&sortBy=created_at&order=desc&q=prisma&tagId=3
  //
  // Publiczny feed ze strony głównej. Odpowiedź { items, pagination } —
  // ten sam kształt co GET /children, więc front ma jeden wzorzec listy.
  public getIndex = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { page, limit, skip } = parsePagination(
      singleQueryParam(req.query.page),
      singleQueryParam(req.query.limit),
      { defaultLimit: 9, maxLimit: 50 }
    );

    const rawSortBy = singleQueryParam(req.query.sortBy);
    const sortBy: SortableField = SORTABLE_FIELDS.includes(rawSortBy as SortableField)
      ? (rawSortBy as SortableField)
      : "created_at";
    // Domyślnie od najnowszych — feed czyta się od góry
    const order = singleQueryParam(req.query.order) === "asc" ? "asc" : "desc";

    const q = singleQueryParam(req.query.q)?.trim().slice(0, MAX_SEARCH_LENGTH);
    const tagId = parseInt(singleQueryParam(req.query.tagId) as string);

    const { items, total } = await postService.listPosts({
      skip,
      take: limit,
      sortBy,
      order,
      q: q || undefined,
      // Śmieci w tagId (NaN, 0, ujemne) = brak filtra, nie błąd
      tagId: Number.isInteger(tagId) && tagId > 0 ? tagId : undefined,
    });

    res.status(200).json({ items, pagination: { page, limit, total } });
  });

  // GET /users/:id/posts — "moje posty", naprawdę wymuszone przez backend,
  // nie tylko przez to, jakie ID wyśle frontend. Dwie warstwy:
  // 1) requireCurrentUser (routes) — bez ważnego access tokenu w ogóle się
  //    tu nie wejdzie (401). To dzięki temu wygasły token realnie coś psuje
  //    i wyzwala cichy refresh po stronie frontu — wcześniej ten endpoint
  //    był publiczny, więc martwy token nikomu nie przeszkadzał.
  // 2) porównanie :id z req.currentUserId (niżej) — zalogowany, ale próbujący
  //    zajrzeć w cudze posty, dostaje 403, nie cudze dane.
  public getByUserId = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = parseInt(req.params.id);
    if (userId !== req.currentUserId) {
      throw new ForbiddenError("Możesz przeglądać tylko własne posty.");
    }
    res.status(200).json(await postService.listPostsByAuthor(userId));
  });

  // GET /posts/:id
  public getById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.status(200).json(await postService.getPost(postId(req)));
  });

  // POST /posts
  public createPost = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { title, content } = req.body;
    res.status(201).json(await postService.createPost(actorId(req), { title, content }));
  });

  // PUT /posts/:id — tylko autor (sprawdza serwis: 404/403)
  public updatePost = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { title, content } = req.body;
    const post = await postService.updatePost(actorId(req), postId(req), { title, content });
    res.status(200).json(post);
  });

  // DELETE /posts/:id — jw.
  public deletePost = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    await postService.deletePost(actorId(req), postId(req));
    res.status(200).json({ message: "Post deleted successfully" });
  });

  // PUT /posts/:id/image — multipart, pole "image"
  public uploadImage = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.file) throw new BadRequestError("Brak pliku (pole 'image')");
    res.status(200).json(await postService.setImage(actorId(req), postId(req), req.file));
  });

  // DELETE /posts/:id/image
  public deleteImage = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.status(200).json(await postService.removeImage(actorId(req), postId(req)));
  });

  // PUT /posts/:id/tags  { names: string[] }
  public setTags = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const names: string[] = Array.isArray(req.body.names) ? req.body.names : [];
    await postService.setTags(actorId(req), postId(req), names);
    res.status(200).json({ message: "Tags updated", tags: names });
  });
}

export default PostController;
