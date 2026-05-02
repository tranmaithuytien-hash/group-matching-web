/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NODE_ENV === "production" ? ".next" : ".next-dev-live"
};

export default nextConfig;
