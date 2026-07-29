import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import type { NextConfig } from "next";

const projectRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle for Docker (node server.js).
  output: "standalone",
  // Pin the workspace root to this project. A stray package.json/node_modules
  // lives in the Windows home directory; without this pin, Turbopack picks the
  // home folder as the workspace root and resolves the wrong dependency tree.
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
