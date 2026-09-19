/** @type {import('next').NextConfig} */

const nextConfig = {
  output: "standalone",

  serverExternalPackages: ["@prisma/client", "sharp"],
};

export default nextConfig;
