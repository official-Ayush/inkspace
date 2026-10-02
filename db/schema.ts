import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const boards = sqliteTable("boards", {
  id: text("id").primaryKey(), title: text("title").notNull(),
  favorite: integer("favorite").notNull().default(0), color: text("color").notNull().default("#ffd76a"),
  sceneKey: text("scene_key").notNull(), revision: integer("revision").notNull().default(1),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
});
