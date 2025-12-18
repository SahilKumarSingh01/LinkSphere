#include <string>
#pragma once
static std::wstring buildOfflinePage(const std::wstring& url, int errorCode) {
    return LR"(<!DOCTYPE html><html lang="en"><head>
        <meta charset="UTF-8">
        <title>LinkSphere – Offline</title>
        <style>
        body{font-family:sans-serif;text-align:center;margin:80px;color:#444}
        button{padding:10px 20px;font-size:14px;margin-top:20px;cursor:pointer;background:#0078D4;color:#fff;border:none;border-radius:4px}
        button:disabled{background:#555;cursor:wait}
        #status{margin-top:15px;font-size:13px;color:#888}
        </style>
        </head><body>
        <h2>LinkSphere server unreachable</h2>
        <p>Cannot connect. Check your network or retry shortly.</p>
        <button id="refreshBtn">Retry</button>
        <div id="status">Error code: )" + std::to_wstring(errorCode) + LR"(</div>
        <script>
            window.originalURL = ')" + url + LR"(';

            const btn = document.getElementById("refreshBtn");
            const status = document.getElementById("status");

            const triggerRefresh = () => {
                btn.textContent = "Loading…";
                btn.disabled = true;
                if (window.originalURL) window.location.href = window.originalURL;
                else status.textContent = "Original URL unavailable.";
            };

            btn.onclick = triggerRefresh;

            setInterval(triggerRefresh, 10000);

            window.chrome.webview.addEventListener("message", e => {
                if (e.data === "close-current")
                    window.chrome.webview.postMessage("close-current");
            });
        </script>

        </body></html>)";
}

