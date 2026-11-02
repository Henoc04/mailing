import { describe, expect, it } from "vitest";
import { SmtpError } from "../src/errors/errors";
import { isHardBounce, isRetryableSmtpError } from "../src/services/smtpTransport.service";

describe("isRetryableSmtpError", () => {
  it("still sees the SMTP code after sendMail wraps the error in SmtpError", () => {
    // Regression: the wrapper used to drop responseCode, making every
    // permanent rejection look retryable.
    expect(isRetryableSmtpError(new SmtpError("rejected", { responseCode: 550 }))).toBe(false);
  });

  it("retries temporary failures", () => {
    expect(isRetryableSmtpError(new SmtpError("greylisted", { responseCode: 451 }))).toBe(true);
  });

  it("retries when there is no code at all (connection problems)", () => {
    expect(isRetryableSmtpError(new SmtpError("socket hang up"))).toBe(true);
  });
});

describe("isHardBounce", () => {
  it("flags unknown mailboxes", () => {
    expect(isHardBounce(new SmtpError("x", { responseCode: 550, response: "550 5.1.1 User unknown" }))).toBe(true);
  });

  it("flags a 550 without enhanced status", () => {
    expect(isHardBounce(new SmtpError("x", { responseCode: 550, response: "550 No such user" }))).toBe(true);
  });

  it("does not flag policy/spam rejections — the address itself may be fine", () => {
    expect(isHardBounce(new SmtpError("x", { responseCode: 550, response: "550 5.7.1 Message rejected as spam" }))).toBe(
      false
    );
    expect(isHardBounce(new SmtpError("x", { responseCode: 554, response: "554 Transaction failed" }))).toBe(false);
  });

  it("does not flag a full mailbox or temporary errors", () => {
    expect(isHardBounce(new SmtpError("x", { responseCode: 552, response: "552 5.2.2 Mailbox full" }))).toBe(false);
    expect(isHardBounce(new SmtpError("x", { responseCode: 451 }))).toBe(false);
    expect(isHardBounce(new SmtpError("timeout"))).toBe(false);
  });
});
