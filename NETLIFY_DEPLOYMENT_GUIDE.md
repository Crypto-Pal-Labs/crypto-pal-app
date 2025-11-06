# 🚀 Complete Netlify Deployment Guide

## ✅ What I've Checked

1. **Netlify CLI**: ✅ Installed (version 23.9.5)
2. **Function Files**: ✅ All exist in `netlify/functions/`
3. **Configuration**: ✅ `netlify.toml` exists
4. **Site Status**: ❓ Not linked locally, need to check dashboard

## 🔍 The Problem

The URL `https://cryptopal.app/.netlify/functions/fetch-transak-order` doesn't work because:
- Either the site isn't deployed at `cryptopal.app`
- Or the functions haven't been deployed yet
- Or the site has a different URL

## 🎯 Solution: Find Your Site & Deploy

### Step 1: Find Your Netlify Site URL

1. **Go to Netlify Dashboard**: https://app.netlify.com
2. **Sign in** (if not already)
3. **Find your site**:
   - Click "Sites" in top navigation
   - Look for your site (might be "crypto-pal-app" or similar)
   - **Check the site URL**:
     - It might be: `your-site-name.netlify.app`
     - Or if you have a custom domain: `cryptopal.app`
     - **Copy this URL** - we'll need it!

### Step 2: Check if Functions Are Deployed

1. **In Netlify Dashboard**, click on your site
2. **Go to "Functions" tab** (in top navigation)
3. **Check if you see**:
   - `fetch-transak-order`
   - `create-transak-session`
   
   **If you DON'T see these**: Functions aren't deployed yet → Go to Step 3
   **If you DO see them**: They're deployed → Go to Step 4

### Step 3: Deploy Functions (If Not Deployed)

#### Option A: Deploy via Netlify CLI (Recommended)

1. **Login to Netlify**:
   ```powershell
   netlify login
   ```
   This will open a browser window for authentication.

2. **Link your site** (if not already linked):
   ```powershell
   netlify link
   ```
   Follow the prompts to select your site.

3. **Deploy functions**:
   ```powershell
   netlify deploy --prod
   ```
   This deploys everything including functions.

4. **Verify deployment**:
   - Check Netlify dashboard → Functions tab
   - You should see your functions listed

#### Option B: Deploy via Netlify Dashboard

1. **Connect your repository** (if not connected):
   - Go to Netlify Dashboard → Your site → Site settings → Build & deploy
   - Connect to GitHub/GitLab/Bitbucket
   - Set build settings:
     - **Base directory**: Leave empty (or set to project root)
     - **Build command**: Leave empty (functions auto-deploy)
     - **Publish directory**: `docs` (from netlify.toml)

2. **Trigger deploy**:
   - Go to Deploys tab
   - Click "Trigger deploy" → "Deploy site"
   - Or push to your repository (if auto-deploy is enabled)

### Step 4: Test Your Function

Once deployed, test with your actual site URL:

**Replace `your-site-name.netlify.app` with your actual site URL:**

```
https://your-site-name.netlify.app/.netlify/functions/fetch-transak-order?orderId=test-order-id
```

Or if you have custom domain:
```
https://cryptopal.app/.netlify/functions/fetch-transak-order?orderId=test-order-id
```

**Expected Response**:
- ✅ Should return JSON (even if it's an error about order not found)
- ✅ Should NOT be "404 Not Found" or "This site can't be reached"

### Step 5: Update Code with Correct URL (If Needed)

If your site URL is different from `cryptopal.app`, I can update the code. Just tell me:
- What is your actual Netlify site URL?

The code that needs updating is in:
- `src/services/TransakOrderService.ts` (line 47)
- `src/screens/Buy.tsx` (multiple locations)

## 🔧 Testing Locally (Optional)

Before deploying, you can test functions locally:

1. **Start Netlify Dev**:
   ```powershell
   npm run dev:functions
   ```
   Or:
   ```powershell
   netlify dev
   ```

2. **Wait for server to start** (it will show a URL like `http://localhost:8888`)

3. **Test the function**:
   - Open browser: `http://localhost:8888/.netlify/functions/fetch-transak-order?orderId=test-order-id`
   - You should see a response

4. **Stop the server**: Press `Ctrl+C` in the terminal

## 📋 Environment Variables Checklist

Make sure these are set in Netlify Dashboard → Site settings → Environment variables:

- ✅ `TRANSAK_API_KEY` - Your Transak API key
- ✅ `TRANSAK_ENV` - `STAGING` or `PRODUCTION`
- ✅ `TRANSAK_ACCESS_TOKEN` - Partner access token (for session creation)
- ✅ `REFERRER_DOMAIN` - Your domain (e.g., `cryptopal.app`)
- ✅ `REDIRECT_URL` - Redirect URL (e.g., `https://cryptopal.app/transak/return`)

## 🎯 Quick Action Plan

1. **Go to**: https://app.netlify.com
2. **Find your site** → Copy the site URL
3. **Check Functions tab** → Are functions deployed?
4. **If not deployed**: Run `netlify login` and `netlify deploy --prod`
5. **Test the function** with your actual site URL
6. **Share the site URL with me** if it's different from `cryptopal.app` so I can update the code

## 🆘 Troubleshooting

### "Function not found" error
- Functions aren't deployed → Deploy them (Step 3)

### "401 Unauthorized" error
- API key missing or wrong → Check environment variables (Step 5)

### "Network request failed"
- Site URL might be wrong → Find correct URL (Step 1)
- Or functions not deployed → Deploy them (Step 3)

### "Timeout" error
- Transak API might be slow → This is normal, function will retry

---

**Next Step**: Start with Step 1 - find your Netlify site URL and share it with me, or let me know if you need help with any step!

