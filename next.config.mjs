/** @type {import('next').NextConfig} */
export default {
  async headers() {
    // Necessário para getDisplayMedia/getUserMedia em iframes não é preciso; mantemos padrão seguro.
    return [{ source: "/(.*)", headers: [{ key: "Permissions-Policy", value: "display-capture=(self), camera=(self), microphone=(self)" }] }];
  },
};
