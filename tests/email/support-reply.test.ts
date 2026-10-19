import { describe, expect, it } from "vitest";
import { render } from "@react-email/components";

import { SupportReplyEmail } from "@/lib/email/templates/support-reply";

describe("SupportReplyEmail", () => {
  it("carries the reply itself and a link that opens Help", async () => {
    const text = await render(
      SupportReplyEmail({
        playerName: "Monica",
        reply: "You're all set. One signature covers every BVL league.",
        helpUrl: "https://mysportsapp.ca/dashboard?help=open",
      }),
      { plainText: true },
    );
    expect(text).toContain("Hi Monica");
    expect(text).toContain("One signature covers every BVL league.");
    expect(text).toContain("https://mysportsapp.ca/dashboard?help=open");
  });

  it("drops the greeting name when there isn't one", async () => {
    const text = await render(
      SupportReplyEmail({ playerName: "", reply: "Done.", helpUrl: "x" }),
      { plainText: true },
    );
    expect(text).toContain("Here's the answer");
  });
});
