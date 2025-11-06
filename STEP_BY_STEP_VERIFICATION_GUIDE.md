# 📋 Step-by-Step Verification Guide
## For Novice Developers - Complete Instructions

This guide will walk you through verifying that the Transak API connectivity fixes are working properly.

---

## ✅ Step 1: Test Netlify Function Deployment (I'll Help You Do This)

### What We're Testing
We need to verify that your Netlify function is deployed and accessible at:
`https://cryptopal.app/.netlify/functions/fetch-transak-order`

### Method 1: Test in Browser (Easiest)

1. **Open your web browser** (Chrome, Firefox, Edge, etc.)

2. **Copy and paste this URL into the address bar:**
   ```
   https://cryptopal.app/.netlify/functions/fetch-transak-order?orderId=test-order-id
   ```

3. **Press Enter** and wait for the page to load

4. **What you should see:**
   - ✅ **Good**: You should see a JSON error message like:
     ```json
     {
       "error": "Transak API error",
       "status": 404,
       "details": "..."
     }
     ```
     This means the function is deployed and working! (404 is expected because "test-order-id" doesn't exist)
   
   - ❌ **Bad**: You see:
     - "This site can't be reached"
     - "404 Not Found" (for the site itself, not the function)
     - Blank page with no response
     
     This means the function might not be deployed yet.

### Method 2: Test Using Command Line (PowerShell)

1. **Open PowerShell** (Windows Key + X, then select "Windows PowerShell" or "Terminal")

2. **Type this command and press Enter:**
   ```powershell
   curl.exe "https://cryptopal.app/.netlify/functions/fetch-transak-order?orderId=test-order-id"
   ```

3. **What you should see:**
   - ✅ **Good**: A JSON response (even if it's an error about the order not existing)
   - ❌ **Bad**: "Unable to connect" or timeout

### Method 3: Test Using a Simple HTML File

I'll create a test file for you to open in your browser.

---

## ✅ Step 2: Verify Netlify Environment Variables

### Why This Is Important
The Netlify function needs your Transak API credentials to work. If they're not set correctly, the function will fail.

### Step-by-Step Instructions

1. **Log into Netlify**
   - Go to: https://app.netlify.com
   - Sign in with your account

2. **Find Your Site**
   - Click on "Sites" in the top navigation
   - Find "cryptopal" (or whatever your site name is)
   - Click on the site name

3. **Navigate to Environment Variables**
   - Click on **"Site settings"** (in the top navigation bar)
   - In the left sidebar, click on **"Environment variables"**
   - You should see a list of variables or an empty list

4. **Check for Required Variables**
   Look for these three variables. If they don't exist, you'll need to add them:

   **Required Variables:**
   - `TRANSAK_API_KEY` - Your Transak API key (should look like: `49362815-1fc8-4dde-ab46-72b51a21aeb3`)
   - `TRANSAK_ENV` - Should be either `STAGING` or `PRODUCTION`
   - `TRANSAK_ACCESS_TOKEN` - Your Transak partner access token

5. **How to Add/Edit Variables:**
   - Click **"Add a variable"** button
   - Enter the **Key** name (e.g., `TRANSAK_API_KEY`)
   - Enter the **Value** (your actual API key or token)
   - Select the scope:
     - **All scopes** (recommended)
     - Or specific scopes if you have different values for production vs preview
   - Click **"Save"**

6. **Verify Variable Values**
   - `TRANSAK_ENV` should be `STAGING` if you're testing, or `PRODUCTION` for live
   - `TRANSAK_API_KEY` should match the key from your Transak dashboard
   - `TRANSAK_ACCESS_TOKEN` should match your partner access token

### ⚠️ Important Notes:
- **Never share these values publicly** - They're like passwords
- **Make sure `TRANSAK_ENV` matches your API key environment**
  - If your API key is from staging, use `STAGING`
  - If your API key is from production, use `PRODUCTION`

---

## ✅ Step 3: Deploy/Update Netlify Functions (If Needed)

### When to Do This
If the function test in Step 1 failed, or if you just made code changes, you need to deploy.

### Option A: Automatic Deployment (If Connected to GitHub)

1. **Make sure your code is committed and pushed to GitHub**
   ```bash
   git add .
   git commit -m "Updated Transak API connectivity fixes"
   git push
   ```

2. **Netlify will automatically deploy** - Check the Netlify dashboard → Deploys tab

### Option B: Manual Deployment (Using Netlify CLI)

1. **Install Netlify CLI** (if not already installed):
   ```powershell
   npm install -g netlify-cli
   ```

2. **Login to Netlify**:
   ```powershell
   netlify login
   ```

3. **Deploy the functions**:
   ```powershell
   netlify deploy --build
   ```

4. **For production deployment**:
   ```powershell
   netlify deploy --prod
   ```

### Option C: Using Netlify Dashboard

1. Go to your Netlify site dashboard
2. Go to **"Deploys"** tab
3. Click **"Trigger deploy"** → **"Deploy site"**
4. This will rebuild and redeploy your site (including functions)

---

## ✅ Step 4: Check Function Logs in Netlify

### Why Check Logs
Logs show you exactly what's happening when the function runs, including any errors.

### Step-by-Step Instructions

1. **Go to Netlify Dashboard**
   - Navigate to your site
   - Click on **"Functions"** in the top navigation

2. **Find Your Function**
   - Look for `fetch-transak-order` in the list
   - Click on it

3. **View Recent Invocations**
   - You'll see a list of recent function calls
   - Click on any invocation to see logs

4. **What to Look For:**
   
   **✅ Good Logs:**
   ```
   Fetching Transak order: { orderId: '...', apiUrl: '...', env: 'STAGING' }
   Successfully fetched Transak order: { id: '...', cryptoCurrency: 'ETH', ... }
   ```
   
   **❌ Error Logs to Check:**
   ```
   Transak API network error: ...  # Network connectivity issue
   Transak API error 401: ...      # Invalid API key
   Transak API error 404: ...      # Order doesn't exist (normal for test orders)
   Request timeout: ...             # API took too long
   ```

5. **Check for Specific Error Messages**
   - Look for the enhanced error messages we added
   - They should include troubleshooting steps

---

## ✅ Step 5: Test from Your App (Check App Logs)

### Why This Is Important
This shows you what's happening when your app tries to fetch order data.

### Step-by-Step Instructions

1. **Open Your App in Development**
   - Make sure you're running the app with logs visible
   - In Expo: `npx expo start`
   - Or run on device/emulator

2. **Complete a Test Transaction**
   - Go through a BUY flow
   - Complete a transaction (or use a previous orderId)

3. **Check Logs for Diagnostic Messages**
   
   Look for these log messages in your console/terminal:

   **✅ Good Logs:**
   ```
   TransakOrderService: Fetching order via Netlify function: { 
     orderId: '...',
     env: 'STAGING',
     baseUrl: 'https://api-stg-partners.transak.com',
     netlifyUrls: { primary: '...', fallback: '...' }
   }
   
   TransakOrderService: ✅ Successfully parsed order: {
     id: '...',
     cryptoCurrency: 'ETH',
     cryptoAmount: '0.01',
     ...
   }
   ```

   **⚠️ Warning Logs (Still OK - Has Fallback):**
   ```
   TransakOrderService: Netlify function unavailable, trying direct API...
   TransakOrderService: Both Netlify function and direct API failed: {
     netlifyError: { message: '...', name: '...', code: '...' },
     directApiError: { message: '...', name: '...', code: '...' },
     troubleshooting: [
       '1. Verify Netlify function is deployed: ...',
       '2. Check Netlify environment variables: ...',
       ...
     ]
   }
   ```

   **These warnings show you exactly what went wrong and how to fix it!**

4. **What Each Log Means:**
   - `Fetching order via Netlify function` - Shows it's trying to use the function
   - `Successfully parsed order` - ✅ Everything worked!
   - `Netlify function unavailable` - Function deployment issue
   - `Both Netlify function and direct API failed` - Shows detailed error breakdown
   - `Network error - API unreachable` - Connectivity issue

### How to View Logs

**If using Expo:**
- Logs appear in the terminal where you ran `npx expo start`
- Or in the Expo DevTools

**If using React Native CLI:**
- `npx react-native log-android` (for Android)
- `npx react-native log-ios` (for iOS)
- Or use Metro bundler console

**If using a device:**
- Use React Native Debugger
- Or enable remote debugging in the app

---

## ✅ Step 6: Test with a Real Order ID (Advanced)

### Why This Is Useful
This tests the function with an actual order from a completed transaction.

### Step-by-Step Instructions

1. **Get a Real Order ID**
   - Complete a transaction in your app
   - Check the app logs for: `orderId: '...'`
   - Or check the transaction in History tab
   - Copy the orderId

2. **Test the Function Directly**
   - Replace `YOUR_ORDER_ID` in this URL:
     ```
     https://cryptopal.app/.netlify/functions/fetch-transak-order?orderId=YOUR_ORDER_ID
     ```
   - Paste in browser or use curl:
     ```powershell
     curl.exe "https://cryptopal.app/.netlify/functions/fetch-transak-order?orderId=YOUR_ORDER_ID"
     ```

3. **Expected Results:**
   - ✅ **Good**: Returns order data with cryptoCurrency, amounts, etc.
   - ❌ **404**: Order might not exist yet (wait a few seconds and try again)
   - ❌ **401/403**: API key issue (check Step 2)
   - ❌ **500/503**: Server error (check Netlify logs)

---

## 📊 Quick Checklist

Use this checklist to track your progress:

- [ ] **Step 1**: Netlify function test - Function accessible?
- [ ] **Step 2**: Environment variables - All 3 variables set correctly?
- [ ] **Step 3**: Function deployment - Functions deployed?
- [ ] **Step 4**: Netlify logs - Checked recent function logs?
- [ ] **Step 5**: App logs - Saw diagnostic messages in app?
- [ ] **Step 6**: Real order test - Tested with actual orderId?

---

## 🆘 Troubleshooting Common Issues

### Issue: "Function not found" or "404"
**Solution**: Function might not be deployed. Go to Step 3 and deploy.

### Issue: "401 Unauthorized" or "403 Forbidden"
**Solution**: API key issue. Check Step 2 - verify `TRANSAK_API_KEY` and `TRANSAK_ENV` match.

### Issue: "Network request failed" in app
**Solution**: 
1. Check Step 1 - is function accessible?
2. Check device internet connection
3. Check Netlify function logs (Step 4)

### Issue: "Request timeout"
**Solution**: 
- Transak API might be slow
- Check network latency
- Function will retry automatically

---

## 📞 Need More Help?

If you're stuck:

1. **Check the detailed guide**: See `TRANSAK_API_CONNECTIVITY_FIX.md`
2. **Check Netlify logs**: Step 4 above
3. **Check app logs**: Step 5 above
4. **Review error messages**: They now include troubleshooting steps!

---

**Next Steps**: Start with Step 1 and work through each step. The enhanced logging will tell you exactly what's wrong if something fails!

