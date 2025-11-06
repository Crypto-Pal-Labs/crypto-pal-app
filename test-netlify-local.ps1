# Test Netlify Function Locally
Write-Host "Testing Netlify Function..." -ForegroundColor Cyan

# Test 1: Check if server is running
Write-Host "`n1. Checking if server is running on port 8888..." -ForegroundColor Yellow
$portCheck = netstat -ano | findstr :8888
if ($portCheck) {
    Write-Host "   ✅ Server is running on port 8888" -ForegroundColor Green
} else {
    Write-Host "   ❌ Server is NOT running" -ForegroundColor Red
    Write-Host "   Run: netlify dev --port 8888" -ForegroundColor Yellow
    exit 1
}

# Test 2: Try different function paths
Write-Host "`n2. Testing function paths..." -ForegroundColor Yellow

$paths = @(
    "/.netlify/functions/fetch-transak-order",
    "/api/fetch-transak-order",
    "/fetch-transak-order"
)

foreach ($path in $paths) {
    $url = "http://localhost:8888$path?orderId=test"
    Write-Host "   Testing: $url" -ForegroundColor Gray
    try {
        $response = Invoke-WebRequest -Uri $url -Method GET -TimeoutSec 3 -ErrorAction Stop
        Write-Host "   ✅ $path - Status: $($response.StatusCode)" -ForegroundColor Green
        break
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        if ($statusCode) {
            Write-Host "   ❌ $path - HTTP $statusCode" -ForegroundColor Red
        } else {
            Write-Host "   ❌ $path - $($_.Exception.Message)" -ForegroundColor Red
        }
    }
}

# Test 3: Test with actual IP address
Write-Host "`n3. Testing with IP address (192.168.1.2)..." -ForegroundColor Yellow
$ipUrl = "http://192.168.1.2:8888/.netlify/functions/fetch-transak-order?orderId=test"
try {
    $response = Invoke-WebRequest -Uri $ipUrl -Method GET -TimeoutSec 3 -ErrorAction Stop
    Write-Host "   ✅ IP address accessible - Status: $($response.StatusCode)" -ForegroundColor Green
} catch {
    Write-Host "   ❌ IP address test failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n✅ Testing complete!" -ForegroundColor Cyan

