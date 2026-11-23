import { Request, Response } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import * as tagService from "../services/tagService";

class TagController {
  // GET /tags
  public getIndex = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.status(200).json(await tagService.listTags());
  });

  // GET /tags/:id
  public getById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.status(200).json(await tagService.getTag(parseInt(req.params.id)));
  });

  // POST /tags
  public createTag = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.status(201).json(await tagService.createTag(req.body.name));
  });

  // PUT /tags/:id
  public updateTag = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.status(200).json(await tagService.renameTag(parseInt(req.params.id), req.body.name));
  });

  // DELETE /tags/:id
  public deleteTag = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    await tagService.deleteTag(parseInt(req.params.id));
    res.status(200).json({ message: "Tag deleted successfully" });
  });
}

export default TagController;
