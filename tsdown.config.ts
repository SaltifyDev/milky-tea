import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    event: 'src/event.ts',
  },
  dts: {
    tsgo: true,
  },
  exports: false,
  // ...config options
})
