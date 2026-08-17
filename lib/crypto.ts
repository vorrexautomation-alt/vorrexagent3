// Compatibility exports. New code should import from ./credentials/crypto.
export {
  encryptCredential,
  decryptCredential,
  __resetCredentialKeyCacheForTests,
} from "./credentials/crypto";
