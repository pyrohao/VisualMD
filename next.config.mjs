/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  transpilePackages: ['@gitee/typescript-sdk-v5'],
  images: {
    unoptimized: true,
  },
}

export default nextConfig
