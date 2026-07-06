import { PrismaClient } from "@prisma/client";

let prisma: PrismaClient | null = null;

export function getPrisma() {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    const error = new Error("DATABASE_URL_MISSING");
    error.name = "DATABASE_URL_MISSING";
    throw error;
  }

  if (!prisma) {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
    });
  }

  return prisma;
}
