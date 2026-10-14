#!/bin/sh
# Builds the fake repository the usage-bar demo runs in: a feature branch two commits ahead of its
# upstream, with a staged, two modified and one untracked file. Fake names only.
set -e
root=/tmp/omods-usage
rm -rf "$root" && mkdir -p "$root"
git init -q --bare -b main "$root/origin.git"
git clone -q "$root/origin.git" "$root/acme-api" 2>/dev/null
cd "$root/acme-api"
git config user.name "Acme Dev" && git config user.email dev@example.com && git config commit.gpgsign false
mkdir -p src tests
printf 'export const total = (items) => items.reduce((a, b) => a + b.price, 0)\n' > src/cart.js
printf 'export const tax = (n) => n * 0.2\n' > src/tax.js
printf '# acme-api\n' > README.md
printf 'export * from "./cart.js"\n' > src/index.js
git add . && git commit -qm "Initial commit" && git push -q origin main
git switch -qc feature/eng-123 && git push -qu origin feature/eng-123
printf 'export const round = (n) => Math.round(n * 100) / 100\n' > src/round.js
git add . && git commit -qm "ENG-123: add round helper"
printf '// ENG-123\n' >> src/cart.js && git commit -qam "ENG-123: use round in cart"
printf '// rounding fix\n' >> src/tax.js && git add src/tax.js
printf '// todo\n' >> src/index.js && printf '# notes\n' >> README.md
printf 'test("round", () => {})\n' > tests/round.test.js
