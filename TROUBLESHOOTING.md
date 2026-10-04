# Student OS — Troubleshooting Guide

## Overview
This guide helps diagnose and fix issues with:
1. **PDF uploads not being stored** — files disappear after Render restarts
2. **404 errors when viewing papers** — students can't open PDFs
3. **Favicon not showing** — browser tab has no icon

---

## Issue 1: Uploads Disappear After Render Restart

### Root Cause
Render has an **ephemeral filesystem** — any files saved to disk are deleted when the app restarts. Student OS must store PDFs in **Cloudflare R2** (object storage) for persistence.

### Diagnosis
Check if R2 is actually being used:

```bash
# 1. Check if R2 env vars are set on Render
echo $R2_ENDPOINT  # Should be: https://[ACCOUNT_ID].r2.cloudflarestorage.com
echo $R2_BUCKET_NAME  # Should be: studentos-pdfs
echo $R2_ACCESS_KEY_ID  # Should be: (a long string)

# 2. Check if new materials have r2Key saved
cat data/materials.json | grep -A5 '"uploadDate": "2026-10-04'  # Look for today's date
# Each material should have: "r2Key": "documents/past-papers/..."
```

### Fix: Set R2 Environment Variables on Render

**On Render Dashboard:**

1. Go to your Student OS service
2. **Settings → Environment**
3. Add/update these variables:

```
R2_ACCOUNT_ID = 545bae9df1e309d5dd81456bb1c5a12e
R2_ACCESS_KEY_ID = 42489596017fc1620a07932e2843a167
R2_SECRET_ACCESS_KEY = dc58ac828162edef37c0bf7e3e2780de077b0252afaffe1da0a7a30a384bde4d
R2_BUCKET_NAME = studentos-pdfs
R2_ENDPOINT = https://545bae9df1e309d5dd81456bb1c5a12e.r2.cloudflarestorage.com
R2_PUBLIC_URL = https://pub-xxxx.r2.dev  # ← IMPORTANT: Use your actual public R2 URL
SESSION_SECRET = (your long random string)
ADMIN_PASSWORD_HASH = (your bcrypt hash)
```

⚠️ **CRITICAL:** Do NOT use the Cloudflare dashboard URL for `R2_PUBLIC_URL`. It should be your public bucket domain (looks like `https://pub-abc123.r2.dev`).

**After updating variables:**
- Save and redeploy
- Admin uploads a new PDF
- Check data/materials.json — the new material should have `"r2Key": "..."`
- If it does, R2 is now working

---

## Issue 2: 404 Errors When Viewing PDFs

### Root Cause
One of these scenarios:

**A) R2 not configured on Render**
- New uploads fall back to local disk (ephemeral, lost on restart)
- When students try to view: file doesn't exist → 404
- **Fix:** Set R2 env vars (see Issue 1)

**B) File deleted from R2 bucket**
- Material record has `r2Key` but file is missing from R2
- Student tries to view → streamR2Object() gets NoSuchKey → 404
- **Fix:** Re-upload the material

**C) R2 credentials wrong**
- Upload fails silently, no r2Key saved, material created without file
- Student tries to view → no r2Key → returns 404
- **Fix:** Verify R2 env vars are correct

**D) Material ID mismatch**
- Rare: ID in URL doesn't match any material in data/materials.json
- **Fix:** Check data/materials.json for the ID

### Diagnosis

```bash
# Check a specific material by ID (e.g., ID 42)
cat data/materials.json | grep -A10 '"id": 42'
# Look for:
#   - "r2Key": "documents/past-papers/..." — file is in R2
#   - "r2Key": null — file is on local disk (will break on Render restart)
#   - NO "r2Key" field — old format, file is lost
```

### Fix: Test the Complete Flow

1. **Go to `/admin` and upload a new PDF**
   - Fill in: Title, Grade, Subject, Material Type
   - Select a PDF file
   - Click Upload

2. **Check data/materials.json**
   ```bash
   tail -50 data/materials.json  # Last uploaded material should be here
   # Should have: "r2Key": "documents/past-papers/timestamp_random_filename.pdf"
   ```

3. **Go to home page → click a grade → click a subject → find the material → click "View"**
   - PDF should open in the iframe
   - If 404, check the browser console (F12 → Network tab)
     - Click the request to `/materials/{id}/raw`
     - Check response status and error message

4. **If still 404, check the server logs**
   ```bash
   # On Render, in the Logs tab:
   # Look for: "[/raw] R2 not configured" or "[/raw] PDF not found in storage"
   ```

---

## Issue 3: Favicon Not Showing

### What Was Fixed
- ✅ Created `favicon.ico`, `favicon.png`, `favicon.svg` in `/public/`
- ✅ Added favicon links to `header.ejs` and `admin-header.ejs`
- ✅ Added theme color metadata

### Verification

**Local testing:**
```bash
# 1. Start the app
npm start
# or
npm run dev

# 2. Open http://localhost:3000
# → Browser tab should show "SOS" icon (cyan/blue on dark)
# → Browser bookmarks should show icon
```

**On Render:**
1. Redeploy (if you made changes to views or public/)
2. Open your Render URL
3. Check browser tab — should show SOS icon
4. If not, hard-refresh (Ctrl+Shift+R or Cmd+Shift+R)

**Troubleshoot:**
```bash
# Check if files exist in public/
ls -la public/favicon*

# Verify they're served correctly
curl -I http://localhost:3000/favicon.ico
# Should get: HTTP/1.1 200 OK
```

---

## Complete Test Checklist

Run this after making fixes to verify everything works:

```
[ ] Local testing
  [ ] npm install && npm run dev
  [ ] Open http://localhost:3000
  [ ] Browser tab shows SOS icon
  [ ] Go to /admin, upload a PDF
  [ ] Check data/materials.json for r2Key
  [ ] Go to home → grade → subject → click "View"
  [ ] PDF opens in iframe (no 404)
  [ ] Click "Download" button
  [ ] PDF downloads correctly

[ ] Render deployment
  [ ] Push code: git push
  [ ] Render auto-deploys
  [ ] Open your Render URL
  [ ] Repeat testing steps above
  [ ] Check Render logs for any errors
  [ ] Hard-refresh browser (Cmd+Shift+R)

[ ] R2 verification
  [ ] Go to Cloudflare R2 bucket
  [ ] Should see: documents/past-papers/, documents/notes/, etc.
  [ ] Click into past-papers/
  [ ] Should see: timestamp_random_filename.pdf files
  [ ] Public URL is NOT the dashboard link (shouldn't be https://dash.cloudflare.com/...)
```

---

## Common Error Messages & Solutions

### "[startup] WARNING: R2 not fully configured"
**Meaning:** One or more R2 env vars are missing
**Solution:** Set all R2 variables on Render (see Issue 1 fix)

### "[/raw] R2 not configured — cannot stream key: documents/..."
**Meaning:** Material has r2Key but R2 env vars missing in this process
**Solution:** Restart the Render service after setting env vars

### "[R2 stream error (view) [404]]: PDF not found in storage"
**Meaning:** r2Key exists but file was deleted from R2 bucket
**Solution:** Re-upload the material, or restore from R2 bucket backup

### Browser shows empty iframe / "Your browser cannot display the PDF"
**Meaning:** Either:
  - PDF didn't open (check Network tab for 404/502)
  - PDF is corrupted
  - Browser can't render PDFs inline (unlikely for modern browsers)
**Solution:**
  - Try the Download button instead
  - Check Network tab to see actual response
  - Re-upload the material

---

## Environment Variables Checklist

Before deploying to Render, verify these are set:

| Variable | Format | Example | Critical? |
|----------|--------|---------|-----------|
| `R2_ACCOUNT_ID` | hex string | `545bae9df1e309d5dd81456bb1c5a12e` | ✅ YES |
| `R2_ACCESS_KEY_ID` | hex string | `42489596017fc1620a07932e2843a167` | ✅ YES |
| `R2_SECRET_ACCESS_KEY` | hex string | `dc58ac828162def...` | ✅ YES |
| `R2_BUCKET_NAME` | alphanumeric+hyphen | `studentos-pdfs` | ✅ YES |
| `R2_ENDPOINT` | URL | `https://545bae9d....r2.cloudflarestorage.com` | ✅ YES |
| `R2_PUBLIC_URL` | URL | `https://pub-xxxx.r2.dev` | ⚠️ Important |
| `SESSION_SECRET` | random 32+ chars | (long string) | ✅ YES |
| `ADMIN_PASSWORD_HASH` | bcrypt hash | `$2b$12$...` | ✅ YES |

⚠️ If any critical variable is missing, PDFs will be lost on Render restart!

---

## Quick Recovery: If Files Were Lost

If R2 wasn't configured and you uploaded files to Render's local disk:

1. **Immediately back up data/materials.json** (save IDs, titles, etc.)
2. **Set R2 env vars on Render** (see Issue 1 fix)
3. **Restart Render service**
4. **Re-upload all materials** from the admin panel
5. **Delete old records from data/materials.json** that don't have r2Key

---

## Next Steps

1. **Fix R2 configuration** (Issue 1) — most critical
2. **Test viewing flow** (Issue 2) — verify it works
3. **Verify favicon** (Issue 3) — should already work
4. **Push fixed code** to GitHub:
   ```bash
   git add .
   git commit -m "fix: R2 storage config, favicon, troubleshooting guide"
   git push
   ```
5. **Redeploy on Render** and test

---

## Still having issues?

Check logs on Render:
1. Go to your service dashboard
2. Click **Logs** tab
3. Search for `[/raw]`, `[storeFile]`, `[startup]` messages
4. Share the error message for diagnosis

Or enable verbose logging temporarily:
```javascript
// In routes/admin.js, after line 42:
console.log("[admin] R2 configured?", R2_CONFIGURED);
console.log("[admin] R2 endpoint:", process.env.R2_ENDPOINT);

// In utils/r2.js, after line 28:
console.log("[r2] R2_CONFIGURED?", R2_CONFIGURED);
```
