#!/bin/bash
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

echo "=== Testing YouTube processor ==="
npx tsx src/processors/youtube.ts "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

echo ""
echo "=== Testing Mission Control POST ==="
curl -s -X POST "${MC_API_URL}/api/content-drops" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${MC_API_TOKEN}" \
  -d '{"source_url":"https://test.com","platform":"web","content_type":"article","title":"Test","raw_content":"Test content","relevant_agents":["sawyer"]}'

echo ""
echo "=== Testing social metrics poller ==="
npx tsx src/poller/index.ts

echo ""
echo "=== All tests complete ==="
