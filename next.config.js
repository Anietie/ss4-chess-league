/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.chess.com",
        port: "",
        pathname: "/**", // Allows all image paths from this domain
      },
    ],
  },
  env: {
    NEXT_PUBLIC_SOCKET_URL:
      process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001",
  },
};

module.exports = nextConfig;
