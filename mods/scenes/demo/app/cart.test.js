const test = require('node:test')
const assert = require('node:assert')

const total = items => items.reduce((sum, item) => sum + item.price * item.qty, 0)

test('totals an empty cart', () => assert.strictEqual(total([]), 0))
test('totals quantities', () => assert.strictEqual(total([{ price: 4, qty: 3 }]), 12))
test('applies every line', () => assert.strictEqual(total([{ price: 2, qty: 1 }, { price: 5, qty: 2 }]), 12))
