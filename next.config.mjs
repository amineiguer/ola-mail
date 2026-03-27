/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["googleapis"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Allow embedding in GHL iframes
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
          // Cookies work cross-origin in iframes
          { key: "X-Frame-Options", value: "ALLOWALL" },
        ],
      },
    ];
  },
};

export default nextConfig;
