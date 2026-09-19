/**
 * Student OS — R2 read client (used for VIEWING/DOWNLOADING files only)
 *
 * This is intentionally separate from routes/admin.js's upload client so the
 * upload flow is never touched. It reuses the same R2 env vars (which are
 * already proven to work, since uploads succeed) to fetch objects directly
 * via the S3-compatible API — instead of depending on R2_PUBLIC_URL, which
 * requires the bucket to have public access enabled and correctly configured.
 *
 * Why this exists: R2_PUBLIC_URL in .env was set to the Cloudflare dashboard
 * page for the bucket (https://dash.cloudflare.com/.../r2/default/buckets/...),
 * not an actual public object URL (which looks like https://pub-xxxx.r2.dev
 * or a custom domain). Any filePath built from that value is a broken link —
 * it opens/redirects to Cloudflare's login-gated dashboard UI, not the PDF.
 * Streaming objects through this authenticated client sidesteps that
 * misconfiguration entirely and works regardless of the bucket's public
 * access settings.
 */

const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");

// This module can be required before routes/admin.js runs its dotenv.config()
// call (site.js is required earlier than admin.js in server.js), so load the
// .env file here too — dotenv.config() is idempotent/safe to call more than
// once per process.
require("dotenv").config();

const R2_CONFIGURED =
  !!process.env.R2_ENDPOINT &&
  !!process.env.R2_ACCESS_KEY_ID &&
  !!process.env.R2_SECRET_ACCESS_KEY &&
  !!process.env.R2_BUCKET_NAME;

const r2 = R2_CONFIGURED
  ? new S3Client({
      region: "auto",
      endpoint: (process.env.R2_ENDPOINT || "").replace(/\s+/g, ""),
      // R2 requires virtual-hosted-style requests (bucket name in the Host
      // header, NOT in the URL path).  forcePathStyle: true was prepending the
      // bucket name to the object key, turning
      //   Key: "documents/past-papers/xyz.pdf"
      // into the request path
      //   /studentos-pdfs/documents/past-papers/xyz.pdf
      // which R2 resolves as key "documents/past-papers/xyz.pdf" *inside a
      // bucket named "studentos-pdfs/documents"* — a bucket that doesn't exist,
      // hence NoSuchKey.  Removing this flag (default false) lets the SDK use
      // the correct virtual-hosted style and the key resolves cleanly.
      credentials: {
        accessKeyId: (process.env.R2_ACCESS_KEY_ID || "").replace(/\s+/g, ""),
        secretAccessKey: (process.env.R2_SECRET_ACCESS_KEY || "").replace(/\s+/g, ""),
      },
    })
  : null;

const R2_BUCKET = process.env.R2_BUCKET_NAME || null;

/**
 * Stream an R2 object straight to an Express response.
 * disposition: "inline" (for the in-browser viewer) or "attachment" (download).
 */
async function streamR2Object(key, res, { filename = "document.pdf", disposition = "inline" } = {}) {
  if (!R2_CONFIGURED) throw new Error("R2 is not configured (missing env vars).");

  const result = await r2.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `${disposition}; filename="${filename.replace(/"/g, "")}"`);
  if (result.ContentLength) res.setHeader("Content-Length", result.ContentLength);

  result.Body.pipe(res);
}

module.exports = { R2_CONFIGURED, R2_BUCKET, r2, streamR2Object };
