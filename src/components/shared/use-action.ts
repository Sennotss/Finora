"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action";

/**
 * Runs a server action, shows a toast for the outcome and exposes pending state.
 * Field errors are returned to the caller so forms can attach them to inputs.
 */
export function useServerAction() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run<T>(action: () => Promise<ActionResult<T>>, options: { onSuccess?: (data: T) => void; onError?: (result: Extract<ActionResult<T>, { ok: false }>) => void; silent?: boolean } = {}) {
    setError(null);
    return new Promise<ActionResult<T>>((resolve) => {
      startTransition(async () => {
        try {
          const result = await action();
          if (result.ok) {
            if (result.message && !options.silent) toast.success(result.message);
            options.onSuccess?.(result.data);
          } else {
            setError(result.error);
            if (!result.fieldErrors || Object.keys(result.fieldErrors).length === 0) toast.error(result.error);
            options.onError?.(result);
          }
          resolve(result);
        } catch (e) {
          // Redirects thrown by actions must propagate; everything else is a network/server failure.
          if (e && typeof e === "object" && "digest" in e && String((e as { digest?: string }).digest).startsWith("NEXT_REDIRECT")) throw e;
          const message = "Something went wrong. Please try again.";
          setError(message);
          toast.error(message);
          resolve({ ok: false, error: message });
        }
      });
    });
  }

  return { pending, error, run };
}
