import { pgTable, text, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const scanTypeEnum = pgEnum("scan_type", ["document", "photo"]);
export const colorModeEnum = pgEnum("color_mode", ["color", "greyscale"]);
export const formatEnum = pgEnum("format", ["pdf", "jpeg"]);

export const scansTable = pgTable("scans", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  pageCount: integer("page_count").notNull().default(1),
  scanType: scanTypeEnum("scan_type").notNull().default("document"),
  colorMode: colorModeEnum("color_mode").notNull().default("color"),
  paperSize: text("paper_size").notNull().default("A4"),
  format: formatEnum("format").notNull().default("pdf"),
  thumbnailUrl: text("thumbnail_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertScanSchema = createInsertSchema(scansTable).omit({
  id: true,
  createdAt: true,
});

export type InsertScan = z.infer<typeof insertScanSchema>;
export type Scan = typeof scansTable.$inferSelect;
