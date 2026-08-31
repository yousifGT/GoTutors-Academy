/**
 * Shrink a photograph in the browser, before it is uploaded.
 *
 * Two problems, one answer.
 *
 * Size: a phone photograph is 3-5MB. A report evidencing ten failures becomes a
 * 40MB PDF, which base64 in a MIME message turns into 55MB — past what SES will
 * send and well past what Gmail or Outlook will accept. The report email would
 * fail, retry five times re-rendering the whole thing each time, and then give
 * up, so the centre head is never told. At 1600px on the long edge the same
 * report is a few megabytes and still shows a blocked fire exit perfectly well.
 *
 * Format: an iPhone photographs in HEIC by default. The server accepted it and
 * the PDF renderer cannot draw it, so the evidence was quietly missing from the
 * document while appearing to have been attached. Anything that goes through a
 * canvas comes out as JPEG, so this normalises the format as a side effect.
 *
 * It also makes uploading over a centre's wifi, from a phone, several times
 * faster — which is the part the inspector actually notices.
 */

/** Long edge, in pixels. Enough to read a label in a photograph of a shelf. */
const MAX_EDGE = 1600;
const QUALITY = 0.82;

/** Below this, resizing costs more than it saves. */
const LEAVE_ALONE_BYTES = 400 * 1024;

export interface Shrunk {
  file: File;
  /** false when the original was returned untouched */
  changed: boolean;
}

export async function shrinkForUpload(
  file: File,
  maxEdge = MAX_EDGE,
  quality = QUALITY
): Promise<Shrunk> {
  const isHeic = /heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
  // Small and already a format the report can draw: nothing to gain.
  if (file.size <= LEAVE_ALONE_BYTES && !isHeic) return { file, changed: false };

  const bitmap = await decode(file);
  if (!bitmap) {
    // Could not be decoded here. HEIC on a browser that cannot read it is the
    // realistic case; the caller refuses it rather than uploading something the
    // report would silently leave out.
    if (isHeic) throw new UndecodableImage();
    return { file, changed: false };
  }

  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { file, changed: false };
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    );
    if (!blob) return { file, changed: false };
    // Only if it actually helped. A small PNG screenshot can come out of JPEG
    // encoding larger than it went in.
    if (blob.size >= file.size && !isHeic) return { file, changed: false };

    return { file: new File([blob], renameToJpg(file.name), { type: "image/jpeg" }), changed: true };
  } finally {
    bitmap.close?.();
  }
}

/** Thrown when the browser cannot read the image at all. */
export class UndecodableImage extends Error {
  constructor() {
    super("This photo is in a format your phone can send but this app cannot read.");
    this.name = "UndecodableImage";
  }
}

async function decode(file: File): Promise<ImageBitmap | null> {
  try {
    // `from-image` applies the EXIF rotation, so a photograph taken sideways is
    // not stored sideways — the canvas has no orientation of its own.
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return null;
  }
}

function renameToJpg(name: string): string {
  return name.replace(/\.[^.]+$/, "") + ".jpg";
}
