import type { NextConfig } from "next";

/**
 * Seeds Tasks is a fully static site (it talks to Supabase from the browser),
 * so it can be hosted anywhere, including GitHub Pages.
 *
 * NEXT_PUBLIC_BASE_PATH: the sub-path the site is served from, e.g.
 * "/seeds-tasks" for https://<user>.github.io/seeds-tasks. Leave empty for a
 * custom domain or local development.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
