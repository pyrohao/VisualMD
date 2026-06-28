/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  turbopack: {
    rules: {
      '*.md': {
        loaders: ['./loaders/raw-md-loader.cjs'],
        as: '*.js',
      },
    },
  },
  transpilePackages: ['@gitee/typescript-sdk-v5'],
  images: {
    unoptimized: true,
  },
}

export default nextConfig
