import { type KeyObject, sign } from "node:crypto";

// Builds a compact JWS (header.claims.signature, each base64url) the way SMART Backend Services expects.
// ES384 signatures are the raw r||s bytes (IEEE P1363), not DER, so dsaEncoding matters.
export function signJwt(header: object, claims: object, privateKey: KeyObject) {
  const encode = (part: object) => Buffer.from(JSON.stringify(part)).toString("base64url");
  const input = `${encode(header)}.${encode(claims)}`;
  const signature = sign("sha384", Buffer.from(input), { key: privateKey, dsaEncoding: "ieee-p1363" });
  return `${input}.${signature.toString("base64url")}`;
}
