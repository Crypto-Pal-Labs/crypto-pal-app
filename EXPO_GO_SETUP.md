# 📱 Using Expo Go with Netlify Functions

## 🔍 The Issue

**Expo Go on your phone** can't access `localhost:8888` on your computer because:
- `localhost` on your phone = the phone itself, not your computer
- They're different devices on the network

## ✅ Solution Options

### Option 1: Use Your Computer's IP Address (Recommended)

Your phone and computer need to be on the same WiFi network, then use your computer's IP instead of `localhost`.

**Step 1: Find Your Computer's IP Address**

On Windows:
```powershell
ipconfig
```

Look for "IPv4 Address" under your WiFi adapter (usually starts with `192.168.` or `10.`)

**Step 2: Update the Code**

I'll update the code to use your computer's IP address automatically, or you can set it manually.

**Step 3: Update Netlify Server**

The Netlify server needs to listen on all interfaces (not just localhost). Let me check if we need to update the command.

### Option 2: Use Expo Go Mode (Simpler - Works Now!)

**Good news**: The app works in Expo Go mode! Netlify functions are **optional** - the Wallet tab works without them.

**Just use Expo Go mode** and test the Wallet tab:
1. Scan QR code with "ExpoGo" option (the one that works)
2. Complete a transaction
3. Check Wallet tab - it should show your purchase!

The Netlify server is just for **enriching** transaction data (exact amounts). The Wallet tab displays transactions **even without Netlify**.

### Option 3: Use Expo Dev Client (For Full Development Features)

If you need development features, you'd need to build a dev client:
```powershell
eas build --profile development --platform android
```

But this takes time and isn't necessary for testing the Wallet tab.

---

## 🎯 Recommended: Use Expo Go Mode

**For now, just use Expo Go mode** (the one that works). The Wallet tab feature is already working - Netlify is just a bonus for complete data.

**Test the Wallet tab:**
1. Use Expo Go mode (the working one)
2. Complete a BUY transaction
3. Go to Wallet tab
4. You should see your purchased token!

The Netlify server running locally is great for later, but not required for the main feature.

---

## 💡 If You Want to Test Netlify Functions

If you want to test the Netlify functions with Expo Go, we need to:

1. **Find your computer's IP** (from `ipconfig`)
2. **Update the code** to use that IP instead of `localhost`
3. **Make sure phone and computer are on same WiFi**

Let me know if you want to set this up, or if you're happy testing with Expo Go mode first!

