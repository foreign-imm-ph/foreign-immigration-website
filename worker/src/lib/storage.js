import { newId } from "./crypto.js";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15MB
const ALLOWED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"]);

export function sanitiseFilename(name) {
  const base = String(name || "file").replace(/[/\\]/g, "_").slice(-120);
  return base.replace(/[^a-zA-Z0-9._-]/g, "_");
}

// Never trust a browser-supplied MIME type alone — sniff the actual bytes
// for the formats we accept before writing anything to R2.
export function sniffContentType(bytes) {
  const b = bytes.subarray(0, 12);
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "application/pdf"; // %PDF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp"; // RIFF....WEBP
  return null;
}

export async function readAndValidateUpload(request) {
  const buf = await request.arrayBuffer();
  if (buf.byteLength === 0) throw new HttpError(400, "Empty upload");
  if (buf.byteLength > MAX_UPLOAD_BYTES) throw new HttpError(413, "File too large (15MB limit)");

  const sniffed = sniffContentType(new Uint8Array(buf));
  if (!sniffed || !ALLOWED_TYPES.has(sniffed)) {
    throw new HttpError(415, "Unsupported file type — PDF, JPEG, PNG or WebP only");
  }

  const filename = sanitiseFilename(request.headers.get("X-Filename") || "document");
  return { bytes: buf, contentType: sniffed, filename };
}

export function documentKey(clientId, applicationId) {
  return `clients/${clientId}/applications/${applicationId}/${newId()}`;
}

export function paymentProofKey(clientId, paymentRequestId) {
  return `clients/${clientId}/payments/${paymentRequestId}/${newId()}`;
}

// The Worker is the only thing that ever touches R2 directly — no public
// bucket, no presigned URLs. Callers must already have verified the
// requester owns the record before calling this.
export async function streamObject(bucket, key, filename, contentType) {
  const object = await bucket.get(key);
  if (!object) return null;
  return new Response(object.body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
