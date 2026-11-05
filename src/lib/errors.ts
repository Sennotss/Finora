export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
    public fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(what = "Record") {
    super(`${what} not found`, 404);
    this.name = "NotFoundError";
  }
}

export class UnauthorizedError extends AppError {
  constructor() {
    super("You must be signed in", 401);
    this.name = "UnauthorizedError";
  }
}

export function fieldError(field: string, message: string): AppError {
  return new AppError(message, 422, { [field]: [message] });
}

/** Prisma unique-constraint violation. */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002";
}
