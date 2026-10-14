// A stand-in test run for the faah demo: prints a failing summary and exits 1.
const out = [
  '',
  ' ✓ src/cart.test.ts (6 tests)',
  ' ✓ src/users.test.ts (5 tests)',
  ' ✗ src/checkout.test.ts (3 tests | 2 failed)',
  '   ✗ applies the discount code',
  '     expected 90 to be 81',
  '   ✗ rounds tax to the cent',
  '     expected 7.4999 to be 7.5',
  '',
  ' Tests  2 failed | 12 passed (14)',
  '',
]
console.log(out.join('\n'))
process.exit(1)
