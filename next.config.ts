import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Bolt (Socket Mode websocket, Node-only deps) should be required at runtime, not bundled.
  serverExternalPackages: ["@slack/bolt"],
};

export default nextConfig;
