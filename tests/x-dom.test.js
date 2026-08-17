import assert from "node:assert/strict";
import test from "node:test";
import { chromeLoginScript, hasChromeXSession, X_LOGIN_URL } from "../lib/chrome-x-cookies.js";
import { EXPAND_JS, HARVEST_JS, READ_HANDLE_JS } from "../lib/x-dom.js";
import { realHandle } from "../lib/config.js";

test("x-dom scripts are executable expressions", () => {
  assert.match(READ_HANDLE_JS, /^\(\(\) =>/);
  assert.match(HARVEST_JS, /^\(\(\) =>/);
  assert.match(EXPAND_JS, /^\(\(\) =>/);
  assert.doesNotThrow(() => new Function(`return ${READ_HANDLE_JS}`));
  assert.doesNotThrow(() => new Function(`return ${HARVEST_JS}`));
  assert.doesNotThrow(() => new Function(`return ${EXPAND_JS}`));
});

test("brief posts need a real handle, not the site name", () => {
  assert.equal(realHandle("X"), "");
  assert.equal(realHandle("home"), "");
  assert.equal(realHandle("login"), "");
  assert.equal(realHandle("@X"), "");
  assert.equal(realHandle("Ada_Lovelace"), "Ada_Lovelace");
});

test("Chrome X session is auth_token, not a leftover twid or guest cookie", () => {
  assert.equal(hasChromeXSession([{ name: "guest_id" }]), false);
  assert.equal(hasChromeXSession([{ name: "twid" }]), false);
  assert.equal(hasChromeXSession([{ name: "auth_token" }]), true);
});

test("Chrome is opened on the X login flow, not home", () => {
  assert.match(X_LOGIN_URL, /x\.com\/i\/flow\/login/);
  const script = chromeLoginScript();
  assert.match(script, /activate/);
  assert.match(script, /i\/flow\/login/);
  assert.match(script, /make new tab/);
});
