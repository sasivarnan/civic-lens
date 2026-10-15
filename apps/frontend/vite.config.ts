import { resolve } from "node:path"
import { readFile } from "node:fs/promises"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "local-vision-assets",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const pathname = new URL(req.url ?? "/", "http://localhost").pathname
          const match = pathname.match(
            /^\/vision\/(vision_wasm(?:_module|_nosimd)?_internal\.(?:js|wasm))$/
          )
          if (!match) return next()
          try {
            const bytes = await readFile(
              resolve(import.meta.dirname, "public/vision", match[1])
            )
            res.setHeader(
              "Content-Type",
              pathname.endsWith(".wasm")
                ? "application/wasm"
                : "application/javascript"
            )
            res.end(bytes)
          } catch {
            res.statusCode = 404
            res.end("Vision asset not found")
          }
        })
      },
    },
  ],
  server: {
    host: "localhost",
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:3000" },
  },
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
})
