import "server-only";
import { ZodError } from "zod";
import { zodFieldErrors } from "./action";
import { getSessionUser, type SessionUser } from "./dal";
import { AppError } from "./errors";

type RouteContext<P> = { params: Promise<P> };

/**
 * Wraps a Route Handler with session verification and consistent JSON errors.
 * Handlers return either a Response or a JSON-serialisable value.
 */
export function apiRoute<P = Record<string, string>>(
  handler: (args: { request: Request; user: SessionUser; params: P }) => Promise<unknown>,
) {
  return async (request: Request, context: RouteContext<P>): Promise<Response> => {
    const user = await getSessionUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    try {
      const result = await handler({ request, user, params: await context.params });
      if (result instanceof Response) return result;
      return Response.json(result ?? { ok: true });
    } catch (error) {
      if (error instanceof ZodError) return Response.json({ error: "Validation failed", fieldErrors: zodFieldErrors(error) }, { status: 422 });
      if (error instanceof AppError) return Response.json({ error: error.message, fieldErrors: error.fieldErrors }, { status: error.status });
      if (error instanceof SyntaxError) return Response.json({ error: "Invalid JSON body" }, { status: 400 });
      console.error("[api]", error);
      return Response.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}

export async function readJson(request: Request): Promise<unknown> {
  return request.json();
}

export function searchParamsObject(request: Request): Record<string, string> {
  return Object.fromEntries(new URL(request.url).searchParams.entries());
}
