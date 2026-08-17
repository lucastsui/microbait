import assert from "node:assert/strict";
import test from "node:test";
import {
  hasLinkedInSessionCookies,
  isLinkedInHost,
  isLinkedInSessionCookie,
  isLoginPopupUrl,
  isOnLinkedInJob,
  previewPartition,
  previewUrl,
  shouldReturnToLinkedInJob,
  X_PREVIEW_PARTITION,
} from "../lib/preview-url.js";

test("previewUrl keeps X posts and LinkedIn job ads", () => {
  assert.equal(previewUrl("https://x.com/ada/status/111"), "https://x.com/ada/status/111");
  assert.equal(previewUrl("https://www.linkedin.com/jobs/view/99"), "https://www.linkedin.com/jobs/view/99");
  assert.equal(previewUrl("https://uk.linkedin.com/jobs/view/99"), "https://uk.linkedin.com/jobs/view/99");
  assert.equal(previewUrl("https://example.com/nope"), "");
  assert.equal(previewUrl("javascript:alert(1)"), "");
});

test("after LinkedIn login, bounce from feed or setup back to the job", () => {
  const job = "https://www.linkedin.com/jobs/view/4418865549";
  assert.equal(shouldReturnToLinkedInJob("https://www.linkedin.com/login", job), false);
  assert.equal(shouldReturnToLinkedInJob("https://www.linkedin.com/checkpoint/lg/login-submit", job), false);
  assert.equal(shouldReturnToLinkedInJob("https://www.linkedin.com/feed/", job), true);
  assert.equal(shouldReturnToLinkedInJob("https://www.linkedin.com/onboarding/start/", job), true);
  assert.equal(shouldReturnToLinkedInJob("https://www.linkedin.com/jobs/", job), true);
  assert.equal(shouldReturnToLinkedInJob("https://uk.linkedin.com/feed/", job), true);
  assert.equal(shouldReturnToLinkedInJob(job, job), false);
  assert.equal(shouldReturnToLinkedInJob("https://www.linkedin.com/jobs/view/gpu-at-nvidia-4418865549", job), false);
  assert.equal(isOnLinkedInJob("https://uk.linkedin.com/jobs/view/4418865549", job), true);
  assert.equal(isLinkedInHost("https://uk.linkedin.com/feed/"), true);
  assert.equal(shouldReturnToLinkedInJob("https://www.linkedin.com/login", job, { signedIn: true }), true);
  assert.equal(shouldReturnToLinkedInJob("https://www.linkedin.com/two-step-verification/", job), false);
  assert.equal(isLinkedInSessionCookie({ name: "li_at", domain: ".linkedin.com" }), true);
  assert.equal(isLinkedInSessionCookie({ name: "guest_id", domain: ".linkedin.com" }), false);
  assert.equal(hasLinkedInSessionCookies([{ name: "li_at", domain: ".linkedin.com" }]), true);
  assert.equal(hasLinkedInSessionCookies([{ name: "guest_id", domain: ".linkedin.com" }]), false);
  assert.equal(isLoginPopupUrl("https://accounts.google.com/o/oauth2/auth"), true);
  assert.equal(isLoginPopupUrl("https://example.com/login"), false);
});

test("X previews reuse the signed-in X partition", () => {
  assert.equal(previewPartition("https://x.com/ada/status/1"), X_PREVIEW_PARTITION);
  assert.match(previewPartition("https://www.linkedin.com/jobs/view/99"), /preview/);
});
