import { describe, expect, test } from "bun:test";
import {
  formatMessageBodyForDisplay,
  htmlToPlainText,
  isHtmlMimeType,
} from "../src/util/html-to-text.ts";

describe("htmlToPlainText", () => {
  test("strips MJML-ish marketing HTML to readable lines", () => {
    const html = `<!doctype html>
<html>
<head><style>.x{color:red}</style><title>Promo</title></head>
<body>
  <!--[if mso | IE]><table><tr><td><![endif]-->
  <div class="mj-column-per-100">
    <p>🌈 Get ready for Rainbow Season!</p>
    <p>No longer want to receive these emails?
      <a href="https://example.com/unsub">Unsubscribe here</a>.
    </p>
    <p>Rebecca Zamolo | P.O. Box 567 Independence, Oregon 97351</p>
  </div>
  <img src="https://ctrk.klclick1.com/pixel.gif" width="1" height="1" alt="" />
</body>
</html>`;

    const text = htmlToPlainText(html);
    expect(text).toContain("Get ready for Rainbow Season!");
    expect(text).toContain("Unsubscribe here <https://example.com/unsub>");
    expect(text).toContain("Rebecca Zamolo | P.O. Box 567 Independence, Oregon 97351");
    expect(text).not.toMatch(/<\/?(?:p|div|table|html|body|a|img)\b/i);
    expect(text).not.toContain("mj-column");
    expect(text).not.toContain("ctrk.klclick1.com");
    expect(text).not.toContain("color:red");
  });

  test("decodes entities and collapses blank lines", () => {
    const text = htmlToPlainText(
      "<p>Hello&nbsp;&amp;&nbsp;world&#33;</p><p></p><p>Next</p>",
    );
    expect(text).toBe("Hello & world!\n\nNext");
  });

  test("formats list items", () => {
    const text = htmlToPlainText("<ul><li>One</li><li>Two</li></ul>");
    expect(text).toContain("• One");
    expect(text).toContain("• Two");
  });
});

describe("formatMessageBodyForDisplay", () => {
  test("converts text/html bodies", () => {
    expect(
      formatMessageBodyForDisplay("<p>Hi</p>", "text/html; charset=utf-8"),
    ).toBe("Hi");
  });

  test("leaves plain text alone", () => {
    expect(formatMessageBodyForDisplay("Just text", "text/plain")).toBe(
      "Just text",
    );
  });

  test("converts HTML-looking bodies even without mime", () => {
    expect(formatMessageBodyForDisplay("<div>Hi</div>", undefined)).toBe("Hi");
  });
});

describe("isHtmlMimeType", () => {
  test("matches html mime types with parameters", () => {
    expect(isHtmlMimeType("text/html; charset=utf-8")).toBe(true);
    expect(isHtmlMimeType("text/plain")).toBe(false);
  });
});
