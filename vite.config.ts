import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import typegpuPlugin from "unplugin-typegpu/vite";

export default defineConfig({
  plugins: [tailwindcss(), react(), typegpuPlugin({})],
});
