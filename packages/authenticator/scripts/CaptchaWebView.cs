using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

/// <summary>
/// WebView2 host for Proton CAPTCHA (Windows counterpart of captcha-webview.swift).
///
/// Must load from an *-api.proton.me host so the relative iframe
/// `/captcha/v1/assets/` resolves to the real CAPTCHA app (not the Mail SPA).
/// </summary>
internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        if (args.Length < 1 || string.IsNullOrWhiteSpace(args[0]))
        {
            Console.Error.WriteLine("usage: captcha-webview <challenge-token>");
            Environment.Exit(1);
            return;
        }

        ApplicationConfiguration.Initialize();
        Application.Run(new CaptchaForm(args[0].Trim()));
    }
}

internal sealed class CaptchaForm : Form
{
    private readonly string _challengeToken;
    private readonly WebView2 _webView;
    private bool _finished;

    private const string BridgeScript = """
        (function () {
          function forward(message) {
            if (!message || message.type !== 'pm_captcha' || !message.token) return;
            // Wrapped form is "<challenge>:<solution>"
            if (String(message.token).indexOf(':') === -1) return;
            try {
              if (window.chrome && window.chrome.webview) {
                window.chrome.webview.postMessage(message);
              }
            } catch (e) {}
          }
          window.addEventListener('message', function (event) {
            forward(event.data);
          }, false);
        })();
        """;

    public CaptchaForm(string challengeToken)
    {
        _challengeToken = challengeToken;
        _webView = new WebView2 { Dock = DockStyle.Fill };

        Text = "Proton CLI — CAPTCHA";
        ClientSize = new Size(520, 720);
        StartPosition = FormStartPosition.CenterScreen;
        TopMost = true;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = true;
        Controls.Add(_webView);

        FormClosing += OnFormClosing;
        Shown += async (_, _) => await InitWebViewAsync();
    }

    private async Task InitWebViewAsync()
    {
        Console.Error.WriteLine("captcha-webview: starting");
        try
        {
            await _webView.EnsureCoreWebView2Async();
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine(
                "captcha-webview: WebView2 init failed — install the WebView2 Runtime.\n" +
                ex.Message);
            Environment.Exit(1);
            return;
        }

        var core = _webView.CoreWebView2;
        core.Settings.AreDefaultContextMenusEnabled = false;
        core.Settings.AreDevToolsEnabled = false;
        core.Settings.IsStatusBarEnabled = false;

        // Inject before any page script so we catch the outer shell's pm_captcha postMessage.
        await core.AddScriptToExecuteOnDocumentCreatedAsync(BridgeScript);

        core.WebMessageReceived += OnWebMessageReceived;
        core.NavigationCompleted += (_, e) =>
        {
            var url = core.Source ?? "?";
            if (e.IsSuccess)
            {
                Console.Error.WriteLine($"captcha-webview: didFinish {url}");
            }
            else
            {
                Console.Error.WriteLine(
                    $"captcha-webview: nav error status={e.WebErrorStatus} {url}");
            }
        };

        var urlBuilder = new UriBuilder("https://account-api.proton.me/core/v4/captcha")
        {
            Query = "Token=" + Uri.EscapeDataString(_challengeToken),
        };
        Console.Error.WriteLine($"captcha-webview: loading {urlBuilder.Uri}");
        Console.Error.WriteLine("captcha-webview: window shown - solve the CAPTCHA here");
        core.Navigate(urlBuilder.Uri.ToString());
    }

    private void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        Console.Error.WriteLine("captcha-webview: message");
        string? raw;
        try
        {
            raw = e.TryGetWebMessageAsString();
        }
        catch
        {
            raw = e.WebMessageAsJson;
        }

        var token = ExtractToken(raw);
        if (string.IsNullOrEmpty(token))
        {
            return;
        }

        Finish(token);
    }

    private static string? ExtractToken(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        try
        {
            using var doc = JsonDocument.Parse(raw);
            return ReadPmCaptchaToken(doc.RootElement);
        }
        catch (JsonException)
        {
            // TryGetWebMessageAsString can return a non-JSON string; ignore.
            return null;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"captcha-webview: parse error {ex.Message}");
            return null;
        }
    }

    private static string? ReadPmCaptchaToken(JsonElement root)
    {
        // chrome.webview.postMessage(object) → JSON object.
        // A string payload may be double-encoded JSON.
        if (root.ValueKind == JsonValueKind.String)
        {
            var inner = root.GetString();
            if (string.IsNullOrWhiteSpace(inner))
            {
                return null;
            }

            using var innerDoc = JsonDocument.Parse(inner);
            return ReadPmCaptchaToken(innerDoc.RootElement);
        }

        if (root.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        var type = root.TryGetProperty("type", out var typeEl)
            ? typeEl.GetString()
            : null;
        var token = root.TryGetProperty("token", out var tokenEl)
            ? tokenEl.GetString()
            : null;

        // Ignore iframe raw (`proton_captcha`) and height pings.
        if (type != "pm_captcha" || string.IsNullOrEmpty(token) || !token.Contains(':'))
        {
            if (type is not null and not "pm_height")
            {
                Console.Error.WriteLine($"captcha-webview: ignoring message type={type}");
            }

            return null;
        }

        return token;
    }

    private void Finish(string successToken)
    {
        if (_finished)
        {
            return;
        }

        _finished = true;
        var payload = JsonSerializer.Serialize(new
        {
            token = successToken,
            tokenType = "captcha",
        });
        Console.Out.WriteLine(payload);
        Console.Out.Flush();
        Console.Error.WriteLine("captcha-webview: success");
        Environment.Exit(0);
    }

    private void OnFormClosing(object? sender, FormClosingEventArgs e)
    {
        if (_finished)
        {
            return;
        }

        Console.Error.WriteLine("{\"error\":\"window_closed\"}");
        Environment.Exit(2);
    }
}
