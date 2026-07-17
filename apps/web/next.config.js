/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: [
    "@chatbot-experiments/client",
    "@chatbot-experiments/ui",
    "@chatbot-experiments/views",
  ],
};

export default nextConfig;
