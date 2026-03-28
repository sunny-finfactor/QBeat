/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  images: {
    domains: ['i.ytimg.com', 'img.youtube.com', 'i.scdn.co', 'mosaic.scdn.co'],
  },
};

module.exports = nextConfig;
