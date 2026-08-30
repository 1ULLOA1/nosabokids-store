import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const restockSubscribers = pgTable("restock_subscribers", {
  id: serial().primaryKey(),
  email: text().notNull().unique(),
  createdAt: timestamp("created_at").defaultNow(),
});
