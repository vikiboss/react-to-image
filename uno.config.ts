import { defineConfig, presetIcons, presetUno } from 'unocss'

export default defineConfig({
  content: { filesystem: ['./src/**/*.{ts,tsx}'] },
  presets: [presetUno(), presetIcons()],
})
