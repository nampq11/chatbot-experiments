/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@dentaltrip-ai/client", "@dentaltrip-ai/ui", "@dentaltrip-ai/views"],
};

export default nextConfig;
