import { apiRoute } from "@/lib/api";
import { db } from "@/lib/db";
import { AppError, NotFoundError } from "@/lib/errors";

type Params = { id: string };

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = new Map([
  ["image/png", [0x89, 0x50, 0x4e, 0x47]],
  ["image/jpeg", [0xff, 0xd8, 0xff]],
  ["image/webp", [0x52, 0x49, 0x46, 0x46]],
  ["application/pdf", [0x25, 0x50, 0x44, 0x46]],
]);

async function ownedTransaction(userId: string, id: string) {
  const tx = await db.transaction.findFirst({ where: { id, userId }, select: { id: true } });
  if (!tx) throw new NotFoundError("Transaction");
  return tx;
}

/** Streams the receipt to its owner only. */
export const GET = apiRoute<Params>(async ({ user, params }) => {
  await ownedTransaction(user.id, params.id);
  const receipt = await db.receipt.findUnique({ where: { transactionId: params.id } });
  if (!receipt || receipt.userId !== user.id) throw new NotFoundError("Receipt");
  return new Response(new Uint8Array(receipt.data), {
    headers: {
      "Content-Type": receipt.mimeType,
      "Content-Length": String(receipt.size),
      "Content-Disposition": `inline; filename="${encodeURIComponent(receipt.fileName)}"`,
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
});

/** Upload or replace (multipart field "file"). Type is verified by magic bytes, not just the header. */
export const POST = apiRoute<Params>(async ({ request, user, params }) => {
  await ownedTransaction(user.id, params.id);
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new AppError("Attach a file in the 'file' field");
  if (file.size === 0 || file.size > MAX_BYTES) throw new AppError("Receipts must be between 1 byte and 2 MB");
  const signature = ALLOWED.get(file.type);
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!signature || !signature.every((b, i) => bytes[i] === b)) throw new AppError("Only PNG, JPEG, WEBP or PDF files are allowed");
  const fileName = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "receipt";
  await db.receipt.upsert({
    where: { transactionId: params.id },
    create: { transactionId: params.id, userId: user.id, fileName, mimeType: file.type, size: file.size, data: bytes },
    update: { fileName, mimeType: file.type, size: file.size, data: bytes },
  });
  return Response.json({ ok: true }, { status: 201 });
});

export const DELETE = apiRoute<Params>(async ({ user, params }) => {
  await ownedTransaction(user.id, params.id);
  await db.receipt.deleteMany({ where: { transactionId: params.id, userId: user.id } });
  return new Response(null, { status: 204 });
});
