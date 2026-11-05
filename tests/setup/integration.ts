import "dotenv/config";
import { afterAll, beforeEach, vi } from "vitest";

// Point the app's Prisma client at the test database before any module loads it.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

// Services verify sessions through the DAL; tests call services directly with a user id.
vi.mock("@/lib/auth", () => ({ auth: async () => null, signIn: vi.fn(), signOut: vi.fn(), handlers: {} }));

const { db } = await import("@/lib/db");

beforeEach(async () => {
  // Users cascade to every owned table; transactions first because of account FKs.
  await db.$executeRawUnsafe(`TRUNCATE "User" CASCADE`);
});

afterAll(async () => {
  await db.$disconnect();
});
