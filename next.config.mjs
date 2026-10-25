/** @type {import('next').NextConfig} */
export default {
  async headers() {
    // Necessário para getDisplayMedia/getUserMedia em iframes não é preciso; mantemos padrão seguro.
    return [
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }] },
      { source: "/(.*)", headers: [{ key: "Permissions-Policy", value: "display-capture=(self), camera=(self), microphone=(self)" }] },
    ];
  },
};
