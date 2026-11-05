"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Dialog state that starts open when the URL has `?new=1` (deep links like "Create a budget"), then cleans the URL. */
export function useOpenFromQuery() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const requested = params.get("new") === "1";
  const [open, setOpen] = useState(requested);
  useEffect(() => {
    if (requested) router.replace(pathname);
  }, [requested, router, pathname]);
  return [open, setOpen] as const;
}
