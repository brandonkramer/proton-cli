#!/usr/bin/env swift
import Cocoa
import WebKit

/// WKWebView host for Proton CAPTCHA.
///
/// Must load from an *-api.proton.me host so the relative iframe
/// `/captcha/v1/assets/` resolves to the real CAPTCHA app (not the Mail SPA).
/// Do NOT set ForceWebMessaging — that disables the webkit message-handler path.

final class CaptchaApp: NSObject, WKScriptMessageHandler, WKNavigationDelegate, NSWindowDelegate {
    private let challengeToken: String
    private let app = NSApplication.shared
    private var window: NSWindow?
    private var webView: WKWebView?
    private var finished = false

    init(challengeToken: String) {
        self.challengeToken = challengeToken
        super.init()
    }

    func run() {
        fputs("captcha-webview: starting\n", stderr)

        let config = WKWebViewConfiguration()
        config.defaultWebpagePreferences.allowsContentJavaScript = true
        config.userContentController.add(self, name: "linuxWebkitWebview")
        config.userContentController.add(self, name: "protonauth")

        // Only forward the outer shell's wrapped token (`challenge:response`).
        // The assets iframe emits `proton_captcha` with the RAW response first —
        // capturing that causes "CAPTCHA validation failed" on /auth.
        let bridge = WKUserScript(
            source: """
            (function () {
              function forward(message) {
                if (!message || message.type !== 'pm_captcha' || !message.token) return;
                // Wrapped form is "<challenge>:<solution>"
                if (String(message.token).indexOf(':') === -1) return;
                try { window.webkit.messageHandlers.protonauth.postMessage(message); } catch (e) {}
              }
              window.addEventListener('message', function (event) {
                forward(event.data);
              }, false);
            })();
            """,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        config.userContentController.addUserScript(bridge)

        let webView = WKWebView(
            frame: NSRect(x: 0, y: 0, width: 520, height: 720),
            configuration: config
        )
        webView.navigationDelegate = self
        webView.customUserAgent =
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15"
        self.webView = webView

        // account-api host: /captcha/v1/assets resolves to the CAPTCHA SPA.
        var components = URLComponents(string: "https://account-api.proton.me/core/v4/captcha")!
        components.queryItems = [
            URLQueryItem(name: "Token", value: challengeToken),
        ]
        if let url = components.url {
            fputs("captcha-webview: loading \(url.absoluteString)\n", stderr)
            webView.load(URLRequest(url: url))
        }

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 520, height: 720),
            styleMask: [.titled, .closable, .miniaturizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Proton Authenticator CLI — CAPTCHA"
        window.contentView = webView
        window.delegate = self
        window.level = .floating
        window.center()
        window.makeKeyAndOrderFront(nil)
        self.window = window

        app.setActivationPolicy(.regular)
        app.activate(ignoringOtherApps: true)
        fputs("captcha-webview: window shown — solve the CAPTCHA here\n", stderr)
        app.run()
    }

    func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: Error
    ) {
        fputs("captcha-webview: nav fail \(error.localizedDescription)\n", stderr)
    }

    func webView(
        _ webView: WKWebView,
        didFail navigation: WKNavigation!,
        withError error: Error
    ) {
        fputs("captcha-webview: nav error \(error.localizedDescription)\n", stderr)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        fputs("captcha-webview: didFinish \(webView.url?.absoluteString ?? "?")\n", stderr)
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        fputs("captcha-webview: message \(message.name)\n", stderr)
        let token = extractToken(from: message.body)
        guard let token, !token.isEmpty else { return }
        finish(successToken: token)
    }

    func windowWillClose(_ notification: Notification) {
        if !finished {
            fputs("{\"error\":\"window_closed\"}\n", stderr)
            exit(2)
        }
    }

    private func extractToken(from body: Any) -> String? {
        let token: String?
        let type: String?

        if let dict = body as? [String: Any] {
            type = dict["type"] as? String
            token = dict["token"] as? String
        } else if let text = body as? String,
                  let data = text.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        {
            type = json["type"] as? String
            token = json["token"] as? String
        } else {
            type = nil
            token = nil
        }

        // Ignore iframe raw (`proton_captcha`) and height pings.
        guard type == "pm_captcha", let token, token.contains(":") else {
            if type != nil, type != "pm_height" {
                fputs("captcha-webview: ignoring message type=\(type ?? "nil")\n", stderr)
            }
            return nil
        }
        return token
    }

    private func finish(successToken: String) {
        guard !finished else { return }
        finished = true
        let payload: [String: String] = ["token": successToken, "tokenType": "captcha"]
        if let data = try? JSONSerialization.data(withJSONObject: payload),
           let line = String(data: data, encoding: .utf8)
        {
            print(line)
            fflush(stdout)
        }
        fputs("captcha-webview: success\n", stderr)
        exit(0)
    }
}

guard CommandLine.arguments.count >= 2 else {
    fputs("usage: captcha-webview <challenge-token>\n", stderr)
    exit(1)
}

CaptchaApp(challengeToken: CommandLine.arguments[1]).run()
