async function testPhase6() {
  console.log('🧪 Starting Phase 6: Dashboard Verification Suite...\n');
  const BASE_URL = 'http://localhost:5000/api';
  let passed = 0;
  let total = 0;

  function assert(condition: boolean, desc: string) {
    total++;
    if (condition) {
      console.log(`  ✅ [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${desc}`);
      throw new Error(`Assertion failed: ${desc}`);
    }
  }

  async function json(res: Response) {
    return res.json();
  }

  function cookieFrom(res: Response, fallback = '') {
    const parts = [...(res.headers.getSetCookie?.() || []), res.headers.get('set-cookie') || '', fallback];
    for (const raw of parts) {
      const match = String(raw).match(/token=[^;]+/);
      if (match) return match[0];
    }
    return fallback;
  }

  const suffix = Date.now();
  const emptyName = 'p6e_' + String(suffix).slice(-11);
  const emptyReg = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: emptyName, email: `${emptyName}@tea.com`, password: 'Password123' }),
  });
  let emptyCookie = cookieFrom(emptyReg);
  const emptyShop = await fetch(`${BASE_URL}/shop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: emptyCookie },
    body: JSON.stringify({ name: 'Brand New Stall', ownerName: 'New Owner', phone: '+91 93333 11111' }),
  });
  emptyCookie = cookieFrom(emptyShop, emptyCookie);
  const emptySummary = await json(await fetch(`${BASE_URL}/dashboard/summary`, { headers: { Cookie: emptyCookie } }));
  const emptyMoves = await json(await fetch(`${BASE_URL}/dashboard/recent-movements`, { headers: { Cookie: emptyCookie } }));
  assert(emptySummary.summary.totalActiveItems === 0 && emptySummary.summary.totalInventoryValue === 0, 'Brand new shop shows empty inventory totals');
  assert(emptyMoves.movements.length === 0, 'Brand new shop has no recent movements');

  const username = 'p6_' + suffix;
  const registerRes = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email: `${username}@tea.com`, password: 'Password123' }),
  });
  let cookie = cookieFrom(registerRes);
  const shopRes = await fetch(`${BASE_URL}/shop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ name: 'Phase 6 Analytics Tea', ownerName: 'Dash Owner', phone: '+91 94444 11111' }),
  });
  cookie = cookieFrom(shopRes, cookie);
  assert(shopRes.status === 201, 'Phase 6 shop setup succeeded');

  const itemARes = await fetch(`${BASE_URL}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      name: 'Assam Leaf ' + suffix,
      category: 'TEA_LEAVES',
      unit: 'KG',
      openingStock: 10,
      unitCost: 100,
      minStock: 2,
      reorderLevel: 4,
      targetStock: 20,
    }),
  });
  const itemA = (await json(itemARes)).item;
  const itemBRes = await fetch(`${BASE_URL}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      name: 'Paper Cups ' + suffix,
      category: 'PACKAGING',
      unit: 'PIECES',
      openingStock: 100,
      unitCost: 1,
      minStock: 20,
      reorderLevel: 40,
      targetStock: 200,
    }),
  });
  const itemB = (await json(itemBRes)).item;

  const before = await json(await fetch(`${BASE_URL}/dashboard/summary`, { headers: { Cookie: cookie } }));
  const expectedValue = 10 * 100 + 100 * 1;
  assert(before.summary.totalActiveItems === 2, 'Summary active item count matches created items');
  assert(before.summary.totalInventoryValue === expectedValue, 'Inventory value matches current stock × unit cost');

  await fetch(`${BASE_URL}/transactions/purchase`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ itemId: itemA.id, quantity: 5, unitCost: 100, idempotencyKey: 'p6-buy-' + suffix }),
  });
  const afterPurchase = await json(await fetch(`${BASE_URL}/dashboard/summary`, { headers: { Cookie: cookie } }));
  assert(afterPurchase.summary.totalInventoryValue === expectedValue + 5 * 100, 'Inventory value updates after a purchase');

  await fetch(`${BASE_URL}/transactions/usage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ itemId: itemA.id, quantity: 13, remarks: 'Service usage to minimum' }),
  });
  const afterUsage = await json(await fetch(`${BASE_URL}/dashboard/summary`, { headers: { Cookie: cookie } }));
  assert(afterUsage.summary.lowStockCount === 1, 'Low-stock count updates after usage (stock 2, at minimum)');

  await fetch(`${BASE_URL}/transactions/usage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ itemId: itemA.id, quantity: 2, remarks: 'Use remaining tea' }),
  });
  const afterEmpty = await json(await fetch(`${BASE_URL}/dashboard/summary`, { headers: { Cookie: cookie } }));
  assert(afterEmpty.summary.outOfStockCount === 1, 'Out-of-stock count updates after usage depletes an item');

  await fetch(`${BASE_URL}/transactions/wastage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ itemId: itemB.id, quantity: 10, wastageReason: 'DAMAGED', remarks: 'Crushed carton' }),
  });
  await fetch(`${BASE_URL}/transactions/wastage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ itemId: itemB.id, quantity: 5, wastageReason: 'EXPIRED', remarks: 'Old stock' }),
  });

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const wastageSummary = await json(
    await fetch(`${BASE_URL}/dashboard/wastage-summary?from=${today}&to=${today}`, { headers: { Cookie: cookie } })
  );
  const damaged = wastageSummary.byReason.find((r: any) => r.reason === 'DAMAGED');
  const expired = wastageSummary.byReason.find((r: any) => r.reason === 'EXPIRED');
  assert(damaged && damaged.value === 10, 'Wastage totals by reason (DAMAGED value = 10 × ₹1)');
  assert(expired && expired.value === 5, 'Wastage totals by reason (EXPIRED value = 5 × ₹1)');
  assert(wastageSummary.quantityByUnit.PIECES === 15, 'Wastage quantity is grouped by unit');

  const recent = await json(await fetch(`${BASE_URL}/dashboard/recent-movements`, { headers: { Cookie: cookie } }));
  const dates = recent.movements.map((m: any) => new Date(m.date).getTime());
  const sorted = [...dates].sort((a, b) => b - a);
  assert(recent.movements.length <= 10, 'Recent movements returns at most 10 rows');
  assert(dates.every((d: number, i: number) => d === sorted[i]), 'Recent movements are ordered newest first');

  const farPast = await json(
    await fetch(`${BASE_URL}/dashboard/wastage-summary?from=2000-01-01&to=2000-01-02`, { headers: { Cookie: cookie } })
  );
  assert(farPast.totalValue === 0 && farPast.transactionCount === 0, 'Date range filtering excludes movements outside the window');

  const trend = await json(
    await fetch(`${BASE_URL}/dashboard/movement-trend?from=${today}&to=${today}`, { headers: { Cookie: cookie } })
  );
  assert(trend.series.length === 1 && trend.totals.purchaseValue > 0, 'Movement trend chart series is built from real purchase/usage values');

  const wastageTrend = await json(
    await fetch(`${BASE_URL}/dashboard/wastage-trend?from=${today}&to=${today}`, { headers: { Cookie: cookie } })
  );
  assert(wastageTrend.totalValue === 15, 'Wastage trend total matches recorded wastage value');

  const replenishment = await json(await fetch(`${BASE_URL}/dashboard/replenishment`, { headers: { Cookie: cookie } }));
  assert(replenishment.items.some((i: any) => i.id === itemA.id && i.suggestedQty === 20), 'Dashboard replenishment uses backend suggested quantities');

  const otherName = 'p6b_' + suffix;
  const otherReg = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: otherName, email: `${otherName}@tea.com`, password: 'Password123' }),
  });
  let cookie2 = cookieFrom(otherReg);
  const otherShop = await fetch(`${BASE_URL}/shop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie2 },
    body: JSON.stringify({ name: 'Isolated Dashboard Shop', ownerName: 'Other', phone: '+91 95555 11111' }),
  });
  cookie2 = cookieFrom(otherShop, cookie2);
  const otherSummary = await json(await fetch(`${BASE_URL}/dashboard/summary`, { headers: { Cookie: cookie2 } }));
  const otherRecent = await json(await fetch(`${BASE_URL}/dashboard/recent-movements`, { headers: { Cookie: cookie2 } }));
  assert(otherSummary.summary.totalActiveItems === 0, "Another shop's items never appear in dashboard summary");
  assert(otherRecent.movements.length === 0, "Another shop's movements never appear in recent movements");

  console.log(`\n🎉 ALL ${passed}/${total} PHASE 6 TEST CHECKLIST ASSERTIONS PASSED!\n`);
}

testPhase6().catch((err) => {
  console.error('Phase 6 Test Failed:', err);
  process.exit(1);
});
