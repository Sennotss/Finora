import Link from "next/link";

export function Brand() {
  return (
    <Link href="/overview" className="flex items-center gap-2 rounded-md px-1 font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-ring">
      <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
          <path d="M5 19V9m7 10V5m7 14v-7" />
        </svg>
      </span>
      <span className="text-[15px]">Finora</span>
    </Link>
  );
}
