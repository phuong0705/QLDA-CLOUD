<#
.SYNOPSIS
    Script khởi chạy Server Web cục bộ và mở Demo Cờ Tướng trên trình duyệt.
    Không yêu cầu cài thêm Node.js hay Python (sử dụng .NET HttpListener có sẵn trên Windows).
#>

$port = 5000
$baseDir = $PSScriptRoot

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")

try {
    $listener.Start()
} catch {
    # Nếu cổng 5000 đang bận, thử sang cổng 5001
    $port = 5001
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add("http://localhost:$port/")
    $listener.Start()
}

$url = "http://localhost:$port/frontend/game.html"
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   XIANGQI WEB - MAY CHU DEMO CO TUONG TRUC TUYEN        " -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Dang khoi chay tai: $url" -ForegroundColor Green
Write-Host " Nhan Ctrl + C trong cua so nay de dung server.`n" -ForegroundColor Gray

# Tu dong mo trinh duyet mac dinh
Start-Process $url

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $path = $request.Url.LocalPath.TrimStart('/')
        if ([string]::IsNullOrEmpty($path)) {
            $path = "frontend/game.html"
        }

        $fullPath = Join-Path $baseDir $path

        if (Test-Path $fullPath -PathType Leaf) {
            $bytes = [System.IO.File]::ReadAllBytes($fullPath)
            $ext = [System.IO.Path]::GetExtension($fullPath).ToLower()

            switch ($ext) {
                ".html" { $response.ContentType = "text/html; charset=utf-8" }
                ".js"   { $response.ContentType = "application/javascript; charset=utf-8" }
                ".css"  { $response.ContentType = "text/css; charset=utf-8" }
                ".svg"  { $response.ContentType = "image/svg+xml" }
                ".png"  { $response.ContentType = "image/png" }
                ".json" { $response.ContentType = "application/json" }
                default { $response.ContentType = "application/octet-stream" }
            }

            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $msg = [System.Text.Encoding]::UTF8.GetBytes("404 - Not Found")
            $response.OutputStream.Write($msg, 0, $msg.Length)
        }

        $response.Close()
    }
} finally {
    $listener.Stop()
    $listener.Close()
}
