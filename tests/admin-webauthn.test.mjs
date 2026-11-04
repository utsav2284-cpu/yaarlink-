import assert from "node:assert/strict";
import test from "node:test";
import {
  adminPasskeyUserHandle,
  isPasskeyCounterAcceptable,
  normalizePasskeyDeviceName,
  parseAdminPasskeyAuthenticationResponse,
  parseAdminPasskeyRegistrationResponse,
  resolveAdminWebAuthnConfig,
  sanitizePasskeyTransports,
} from "../shared/admin-webauthn.ts";

test("production apex and www share one registrable WebAuthn RP ID", () => {
  for (const origin of ["https://theyaar.com", "https://www.theyaar.com"]) {
    assert.deepEqual(resolveAdminWebAuthnConfig(origin), {
      rpID: "theyaar.com",
      expectedOrigins: ["https://theyaar.com", "https://www.theyaar.com"],
    });
  }
});

test("preview, staging, and loopback origins stay cryptographically separate", () => {
  assert.deepEqual(resolveAdminWebAuthnConfig("https://3000-example.e2b.app"), {
    rpID: "3000-example.e2b.app",
    expectedOrigins: ["https://3000-example.e2b.app"],
  });
  assert.deepEqual(resolveAdminWebAuthnConfig("http://localhost:3000"), {
    rpID: "localhost",
    expectedOrigins: ["http://localhost:3000"],
  });
  assert.equal(resolveAdminWebAuthnConfig("https://127.0.0.1:3000")?.rpID, "127.0.0.1");
});

test("unsafe or malformed WebAuthn origins fail closed", () => {
  for (const origin of [
    null,
    undefined,
    "",
    "not a url",
    "http://www.theyaar.com",
    "https://192.0.2.10",
    "https://www.theyaar.com/admin/security",
    "https://user:pass@www.theyaar.com",
    "https://bad_host.example.com",
  ]) {
    assert.equal(resolveAdminWebAuthnConfig(origin), null, String(origin));
  }
});

test("Passkey user handle is the exact 16 administrator UUID bytes", () => {
  const handle = adminPasskeyUserHandle("00112233-4455-4677-8899-aabbccddeeff");
  assert.deepEqual(
    Array.from(handle ?? []),
    [0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x46, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff],
  );
  assert.equal(adminPasskeyUserHandle("not-a-uuid"), null);
});

test("Passkey device names and transports are bounded and allowlisted", () => {
  assert.equal(normalizePasskeyDeviceName("  Owner   phone  "), "Owner phone");
  assert.equal(normalizePasskeyDeviceName(""), null);
  assert.equal(normalizePasskeyDeviceName("x".repeat(121)), null);
  assert.equal(normalizePasskeyDeviceName("Bad\u0000name"), null);
  assert.deepEqual(sanitizePasskeyTransports(["internal", "USB", "internal", "unknown", 42, "hybrid"]), [
    "internal",
    "usb",
    "hybrid",
  ]);
  assert.deepEqual(sanitizePasskeyTransports("internal"), []);
});

test("WebAuthn browser responses are structurally bounded before verification", () => {
  const registration = {
    id: "credential-id_1",
    rawId: "credential-id_1",
    type: "public-key",
    authenticatorAttachment: "platform",
    clientExtensionResults: { ignored: { nested: true } },
    response: {
      clientDataJSON: "client-data",
      attestationObject: "attestation-data",
      transports: ["internal", "unknown"],
      publicKeyAlgorithm: -7,
      extra: "not forwarded",
    },
  };
  assert.deepEqual(parseAdminPasskeyRegistrationResponse(registration), {
    id: "credential-id_1",
    rawId: "credential-id_1",
    type: "public-key",
    authenticatorAttachment: "platform",
    clientExtensionResults: {},
    response: {
      clientDataJSON: "client-data",
      attestationObject: "attestation-data",
      transports: ["internal"],
      publicKeyAlgorithm: -7,
    },
  });

  assert.equal(
    parseAdminPasskeyRegistrationResponse({
      ...registration,
      response: { ...registration.response, attestationObject: "x".repeat(32769) },
    }),
    null,
  );
  assert.equal(parseAdminPasskeyRegistrationResponse(null), null);
  assert.equal(parseAdminPasskeyRegistrationResponse({ ...registration, rawId: "different" }), null);

  const authentication = {
    id: "credential-id_1",
    rawId: "credential-id_1",
    type: "public-key",
    response: {
      clientDataJSON: "client-data",
      authenticatorData: "authenticator-data",
      signature: "signature-data",
    },
  };
  assert.equal(parseAdminPasskeyAuthenticationResponse(authentication)?.response.signature, "signature-data");
  assert.equal(
    parseAdminPasskeyAuthenticationResponse({
      ...authentication,
      response: { ...authentication.response, signature: "not base64url!" },
    }),
    null,
  );
});

test("Passkey signature counters allow zero-only authenticators but reject regressions", () => {
  assert.equal(isPasskeyCounterAcceptable(0, 0), true);
  assert.equal(isPasskeyCounterAcceptable(0, 1), true);
  assert.equal(isPasskeyCounterAcceptable(41, 42), true);
  assert.equal(isPasskeyCounterAcceptable(42, 42), false);
  assert.equal(isPasskeyCounterAcceptable(42, 41), false);
  assert.equal(isPasskeyCounterAcceptable(-1, 1), false);
  assert.equal(isPasskeyCounterAcceptable(0, 0x1_0000_0000), false);
});
