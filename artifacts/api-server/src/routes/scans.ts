import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, scansTable } from "@workspace/db";
import {
  CreateScanBody,
  CreateScanResponse,
  GetScanParams,
  GetScanResponse,
  DeleteScanParams,
  ListScansResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/scans", async (_req, res): Promise<void> => {
  const scans = await db
    .select()
    .from(scansTable)
    .orderBy(scansTable.createdAt);
  res.json(ListScansResponse.parse(scans));
});

router.post("/scans", async (req, res): Promise<void> => {
  const parsed = CreateScanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [scan] = await db
    .insert(scansTable)
    .values({
      name: parsed.data.name,
      pageCount: parsed.data.pageCount ?? 1,
      scanType: (parsed.data.scanType as "document" | "photo") ?? "document",
      colorMode: (parsed.data.colorMode as "color" | "greyscale") ?? "color",
      paperSize: parsed.data.paperSize ?? "A4",
      format: (parsed.data.format as "pdf" | "jpeg") ?? "pdf",
      thumbnailUrl: parsed.data.thumbnailUrl ?? null,
    })
    .returning();

  res.status(201).json(CreateScanResponse.parse(scan));
});

router.get("/scans/:id", async (req, res): Promise<void> => {
  const params = GetScanParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [scan] = await db
    .select()
    .from(scansTable)
    .where(eq(scansTable.id, params.data.id));

  if (!scan) {
    res.status(404).json({ error: "Scan not found" });
    return;
  }

  res.json(GetScanResponse.parse(scan));
});

router.delete("/scans/:id", async (req, res): Promise<void> => {
  const params = DeleteScanParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [scan] = await db
    .delete(scansTable)
    .where(eq(scansTable.id, params.data.id))
    .returning();

  if (!scan) {
    res.status(404).json({ error: "Scan not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
