import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Both ship WebAssembly and resolve it relative to their own package on
  // disk. Bundled, that resolution produces a URL where the runtime wants a
  // path, and every request fails with ERR_INVALID_ARG_TYPE.
  serverExternalPackages: ["pdfjs-dist", "@electric-sql/pglite"],

  outputFileTracingIncludes: {
    // The extractor resolves these at runtime; without tracing them the path
    // exists in the deployment but the files do not.
    "/api/**": ["./node_modules/pdfjs-dist/standard_fonts/**"],
  },
};

export default nextConfig;
