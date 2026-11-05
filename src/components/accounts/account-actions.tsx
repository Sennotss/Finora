"use client";

import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Ellipsis, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { archiveAccountAction, deleteAccountAction } from "@/features/accounts/actions";
import { useState } from "react";

export function AccountActions({ accountId, archived, canDelete, name }: { accountId: string; archived: boolean; canDelete: boolean; name: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<"archive" | "delete" | null>(null);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="More account actions"><Ellipsis /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {archived ? (
            <DropdownMenuItem onSelect={async () => { const r = await archiveAccountAction(accountId, false); if (r.ok) toast.success("Account restored"); else toast.error(r.error); }}>
              <ArchiveRestore /> Unarchive
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => setConfirm("archive")}><Archive /> Archive</DropdownMenuItem>
          )}
          <DropdownMenuItem variant="destructive" disabled={!canDelete} onSelect={() => setConfirm("delete")}>
            <Trash2 /> Delete{!canDelete && " (has history)"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmationDialog
        open={confirm === "archive"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Archive ${name}?`}
        description="Archived accounts are hidden from forms but keep their full history, and their balances still count toward net worth."
        confirmLabel="Archive"
        onConfirm={async () => {
          const r = await archiveAccountAction(accountId, true);
          if (r.ok) toast.success("Account archived");
          else toast.error(r.error);
        }}
      />
      <ConfirmationDialog
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Delete ${name}?`}
        description="This permanently removes the account. Only accounts without any transactions can be deleted."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          const r = await deleteAccountAction(accountId);
          if (r.ok) {
            toast.success("Account deleted");
            router.push("/accounts");
          } else toast.error(r.error);
        }}
      />
    </>
  );
}
