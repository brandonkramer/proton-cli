/**
 * Re-export shared CAPTCHA / human-verification helpers from core.
 * Binary + Swift sources remain under packages/authenticator/.
 */
export {
  API_CODE_HUMAN_VERIFICATION,
  HumanVerificationError,
  humanVerificationHeaders,
  isHumanVerificationError,
  solveCaptchaInBrowser,
  type HumanVerificationDetails,
  type HumanVerificationResult,
} from "@bkramer/proton-core";
