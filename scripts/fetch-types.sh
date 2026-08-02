#!/bin/bash
rm -rf ./src/gen
mkdir -p ./src/gen
echo;
echo 'Fetching types...'
curl -o './src/gen/types.ts' 'https://milky-next.ntqqrev.org/raw/typescript/static.txt'
echo;
echo 'Fetching zod types...'
curl -o './src/gen/zod.ts' 'https://milky-next.ntqqrev.org/raw/typescript/zod.txt'
pnpm exec jiti ./scripts/generate-meta.ts
pnpm exec jiti ./scripts/split-zod.ts
