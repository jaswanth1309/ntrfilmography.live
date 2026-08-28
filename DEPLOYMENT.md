# NTR Filmography - Modern Cloudflare Pages Deployment Guide
## Hono API + React Frontend + Cloudflare R2 Storage

This repository is powered by a modern, high-performance, unified **Hono + React** serverless stack fully optimized for **Cloudflare Pages**. 

By pairing **Vite + React (Frontend)** with **Hono (Backend)** running natively inside **Cloudflare Pages Functions (Workers)**, you get:
1. **Unbeatable Edge Performance**: Your API requests run globally at the closest Cloudflare edge location with `<10ms` startup latency.
2. **Unified Git Deployment**: Pushing your code to GitHub automatically builds and deploys both your frontend and your API backend to Cloudflare Pages simultaneously in seconds.
3. **Infinite Scaling & Cost Savings**: Benefit from Cloudflare's massive free tier (100k requests/day for workers/functions, and 10 million class A operations/month for R2).
4. **Complete AWS S3 SDK compatibility**: Hono runs `@aws-sdk/client-s3` natively at the edge to fetch, list, and sign your R2 bucket contents.

---

## 📋 Table of Contents
1. [Step 1: Set Up Cloudflare R2 Bucket & CORS](#step-1-set-up-cloudflare-r2-bucket--cors)
2. [Step 3: Connect GitHub and Create Cloudflare Pages Project](#step-2-connect-github-and-create-cloudflare-pages-project)
3. [Step 3: Configure Cloudflare Pages Environment Variables](#step-3-configure-cloudflare-pages-environment-variables)
4. [Step 4: Push Clean Code to Your Git Repo and Deploy](#step-4-push-clean-code-to-your-git-repo-and-deploy)

---

## Step 1: Set Up Cloudflare R2 Bucket & CORS

Configure your Cloudflare R2 bucket to serve files publicly and allow secure fetches from your production web server.

### 1. Enable R2 Public Domain
1. Go to your **Cloudflare Dashboard** -> **R2** -> Select your bucket (`ntrfilmography-media`).
2. Go to the **Settings** tab.
3. Scroll down to **Public Access**.
4. Enable the **r2.dev Subdomain** (or bind a custom domain for production).
5. Copy this URL (e.g., `https://pub-xxxxxx.r2.dev`). This is your `CLOUDFLARE_R2_PUBLIC_URL`.

### 2. Configure CORS Policy
Under the **Settings** tab in your R2 bucket:
1. Scroll down to **CORS Policy** and click **Add CORS Policy** (or edit existing).
2. Paste the following JSON (this allows your production website to read and stream files smoothly):

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3000",
      "https://*.pages.dev",
      "https://your-custom-domain.com"
    ],
    "AllowedMethods": [
      "GET",
      "HEAD",
      "OPTIONS"
    ],
    "AllowedHeaders": [
      "*"
    ],
    "ExposeHeaders": [
      "Content-Length",
      "Content-Type",
      "Content-Range"
    ],
    "MaxAgeSeconds": 3600
  }
]
```
3. Click **Save**.

### 3. Generate API Credentials (R2 Access Keys)
1. In the main **R2** page of your Cloudflare dashboard, click **Manage R2 API Tokens** (on the right-side menu).
2. Click **Create API Token**.
3. Set the name (e.g., `NTR Filmography Read-Only Token`).
4. Set permissions to **Read** (or **Edit** if your app will upload files in the future).
5. Set TTL to **Forever** (or your preferred duration).
6. Click **Create Token**.
7. Copy and save these credentials:
   - **Access Key ID** (e.g., `2c3...`)
   - **Secret Access Key** (e.g., `8f9...`)
   - **Endpoint** (e.g., `https://<account_id>.r2.cloudflarestorage.com`)

---

## Step 2: Connect GitHub and Create Cloudflare Pages Project

Cloudflare Pages automatically reads the `/functions` folder in your project and provisions your Hono backend API as serverless functions.

1. Go to your **Cloudflare Dashboard** -> **Workers & Pages** -> **Create Application** -> **Pages** tab -> click **Connect to Git**.
2. Select your repository.
3. In the **Build configuration** step, choose the following:
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Build Output Directory**: `dist`
4. Click **Save and Deploy**. (The first build might take a minute, then proceed to add env variables).

---

## Step 3: Configure Cloudflare Pages Environment Variables

To allow your Hono API to securely authenticate and fetch media from your Cloudflare R2 bucket, you must provide your R2 credentials.

1. In your **Cloudflare Pages Project settings**, navigate to the **Settings** -> **Environment variables** tab.
2. Scroll to the **Production** environment variable section (and optionally **Preview** as well).
3. Click **Add variables** and insert the following keys:

| Variable Name | Description | Example / Value |
|---|---|---|
| `CLOUDFLARE_R2_ENDPOINT` | Your S3 API endpoint URL | `https://<account_id>.r2.cloudflarestorage.com` |
| `CLOUDFLARE_R2_ACCESS_KEY_ID` | Your R2 Access Key ID | `2c3d4...` |
| `CLOUDFLARE_R2_SECRET_ACCESS_KEY` | Your R2 Secret Access Key | `8f9g0...` |
| `CLOUDFLARE_R2_BUCKET_NAME` | Your target R2 bucket name | `ntrfilmography-media` |
| `CLOUDFLARE_R2_PUBLIC_URL` | Your R2 public domain URL | `https://pub-xxxxxx.r2.dev` |

4. Click **Save**.
5. Click **Deployments** -> select your latest deployment -> click **Retry deployment** to apply the environment variables!

---

## Step 4: Push Clean Code to Your Git Repo and Deploy

To commit your beautifully configured **Hono + React** codebase to your new repository:

1. Open your terminal in the root folder of this project.
2. Initialize a fresh Git repository:
   ```bash
   git init
   ```
3. Add files to staging:
   ```bash
   git add .
   ```
4. Commit:
   ```bash
   git commit -m "feat: modern native Hono + React full-stack stack on Cloudflare Pages"
   ```
5. Point to your empty new GitHub repository:
   ```bash
   git remote add origin https://github.com/your-username/your-repo-name.git
   ```
6. Force the default branch name to `main`:
   ```bash
   git branch -M main
   ```
7. Push:
   ```bash
   git push -u origin main
   ```

Cloudflare Pages will immediately detect this push, build your Vite React assets, bundle the Hono API under `/functions`, and make your serverless filmography system live on `<your-app>.pages.dev` with maximum speed and zero maintenance!
