// Builds a real, correctly-signed (self-issued) Cloudflare Access JWT for
// testing lib/staffAuth.js's actual RSASSA-PKCS1-v1_5/SHA-256 verification
// path end to end, instead of only testing the "no header" rejection case.
// Mocks the one network call staffAuth.js makes (fetching the team's JWKS)
// so verification runs entirely against a keypair generated in-process --
// no real Cloudflare Access tenant or network access involved.
function base64UrlEncode(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlEncodeJson(obj) {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(obj)));
}

export async function generateTestAccessKeypair() {
  const keyPair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"]
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const kid = "test-key-1";
  return { keyPair, jwks: { keys: [{ ...publicJwk, kid, alg: "RS256", use: "sig" }] }, kid };
}

export async function signTestAccessJwt(keyPair, kid, payload) {
  const header = { alg: "RS256", typ: "JWT", kid };
  const headerB64 = base64UrlEncodeJson(header);
  const payloadB64 = base64UrlEncodeJson(payload);
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keyPair.privateKey,
    new TextEncoder().encode(signingInput)
  );
  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

// Replaces global fetch for the duration of a test with one that serves the
// given JWKS for the Access certs endpoint and delegates everything else to
// the real fetch (none of these tests need anything else). Returns a
// restore function.
export function mockAccessJwksEndpoint(teamDomain, jwks) {
  const realFetch = globalThis.fetch;
  const certsUrl = `https://${teamDomain}/cdn-cgi/access/certs`;
  globalThis.fetch = async (url, init) => {
    if (String(url) === certsUrl) {
      return new Response(JSON.stringify(jwks), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return realFetch(url, init);
  };
  return () => {
    globalThis.fetch = realFetch;
  };
}
