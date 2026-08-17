/** @type {import('next').NextConfig} */
const nextConfig = {
  // These are native/Node-only server packages (isolated-vm ships a
  // compiled .node binary; pg/mysql2/ioredis/bullmq/nodemailer all assume
  // a real Node runtime). Left un-externalized, Next's webpack build tries
  // to bundle them for the server the same way it would a normal JS
  // dependency, and isolated-vm's dynamic `require('./out/' + ...)` binary
  // lookup can't be statically resolved, which fails the whole build with
  // "Module not found: Can't resolve './out/isolated_vm'" even though the
  // module is present and works fine at runtime under plain Node.
  experimental: {
    serverComponentsExternalPackages: ["isolated-vm", "pg", "mysql2", "ioredis", "bullmq", "nodemailer"],
  },
};
module.exports = nextConfig;
