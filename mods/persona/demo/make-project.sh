#!/bin/sh
# Builds the fake project the persona demo runs in. Fake names only.
set -e
p=/tmp/omods-persona/acme-shop
rm -rf /tmp/omods-persona && mkdir -p $p/src/components $p/src/api
cat > $p/src/components/Button.tsx <<'TSX'
export function Button({ label }: { label: string }) {
  return <button className="px-4 py-2 bg-indigo-600 text-white">{label}</button>
}
TSX
cat > $p/src/api/orders.ts <<'TS'
export type Order = { id: string; total: number }
TS
