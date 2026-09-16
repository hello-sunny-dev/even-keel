import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Both ship WebAssembly and resolve it relative to their own package on
  // disk. Bundled, that resolution produces a URL where the runtime wants a
  // path, and every request fails with ERR_INVALID_ARG_TYPE.
  serverExternalPackages: ["pdfjs-dist", "@electric-sql/pglite"],

  // The floating dev badge sits on top of the bottom tab bar, which is where
  // this app's navigation lives on a phone — so on the primary device it
  // covers the first tab. The route information it offers is in the terminal
  // anyway.
  devIndicators: false,

  outputFileTracingIncludes: {
    // Resolved at runtime, so the tracer never sees them and the deployment
    // ends up with the path but not the file.
    //
    // `pdf.worker.mjs` is the one that mattered. With no worker configured,
    // pdfjs falls back to a "fake worker" that imports it by a computed
    // specifier from inside `pdf.mjs` — invisible to the tracer, which shipped
    // `pdf.mjs` alone. On Vercel every statement failed with "Setting up fake
    // worker failed: Cannot find module .../pdf.worker.mjs", which reached the
    // user as "That file could not be read as a PDF". It cannot reproduce
    // locally: a local production build has the whole of node_modules next to
    // it, so the import resolves whether or not anything traced it.
    "/api/**": [
      "./node_modules/pdfjs-dist/standard_fonts/**",
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    ],
  },

  /**
   * The headers that are the same on every response. The Content-Security-Policy
   * is not among them: it carries a per-request nonce and is set in `proxy.ts`.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Two years, and the subdomains too. This app is only ever reached
          // over HTTPS; a first request over HTTP is one that can be rewritten
          // in transit.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // frame-ancestors covers this for anything current. Kept for the
          // browsers that only understand the old header.
          { key: "X-Frame-Options", value: "DENY" },
          // A referrer carrying a household's URL is a URL somebody else can
          // try. Same-origin navigation keeps it; leaving the site does not.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
      {
        // Belt and braces with the metadata robots tag: nothing here is for
        // anybody who has not been invited.
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
      },
    ];
  },
};

export default nextConfig;
