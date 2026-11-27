async function testPhase5() {
  console.log('🧪 Starting Phase 5: Replenishment Verification Suite...\n');
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
  const username = 'p5_' + String(suffix).slice(-12);
  const registerRes = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email: `${username}@tea.com`, password: 'Password123' }),
  });
  let cookie = cookieFrom(registerRes);
  if (registerRes.status !== 201) {
    console.error('Register response', registerRes.status, await registerRes.text());
  }
  assert(registerRes.status === 201, 'Registered Phase 5 shopkeeper');

  const shopRes = await fetch(`${BASE_URL}/shop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ name: 'Phase 5 Chai Bar', ownerName: 'Phase Five', phone: '+91 90000 11111' }),
  });
  if (shopRes.status !== 201) {
    console.error('Shop setup response', shopRes.status, await shopRes.text(), 'cookie=', cookie);
  }
  cookie = cookieFrom(shopRes, cookie);
  assert(shopRes.status === 201, 'Shop setup issued a session with shopId');

  async function createItem(body: Record<string, unknown>) {
    const res = await fetch(`${BASE_URL}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify(body),
    });
    const data = await json(res);
    assert(res.status === 201, `Created item ${body.name}`);
    return data.item;
  }

  const outItem = await createItem({
    name: 'Out of Stock Tea ' + suffix,
    category: 'TEA_LEAVES',
    unit: 'KG',
    openingStock: 0,
    unitCost: 100,
    minStock: 2,
    reorderLevel: 5,
    targetStock: 10,
  });

  const lowItem = await createItem({
    name: 'Low Stock Milk ' + suffix,
    category: 'DAIRY',
    unit: 'LITRES',
    openingStock: 2,
    unitCost: 50,
    minStock: 2,
    reorderLevel: 5,
    targetStock: 10,
  });

  const reorderItem = await createItem({
    name: 'Needs Reorder Sugar ' + suffix,
    category: 'SWEETENERS',
    unit: 'KG',
    openingStock: 4,
    unitCost: 40,
    minStock: 2,
    reorderLevel: 5,
    targetStock: 10,
  });

  const healthyItem = await createItem({
    name: 'Healthy Ginger ' + suffix,
    category: 'SPICES',
    unit: 'KG',
    openingStock: 12,
    unitCost: 80,
    minStock: 2,
    reorderLevel: 5,
    targetStock: 10,
  });

  const atTargetItem = await createItem({
    name: 'At Target Cups ' + suffix,
    category: 'PACKAGING',
    unit: 'PIECES',
    openingStock: 10,
    unitCost: 2,
    minStock: 2,
    reorderLevel: 5,
    targetStock: 10,
  });

  const noSupplierItem = await createItem({
    name: 'No Supplier Spice ' + suffix,
    category: 'SPICES',
    unit: 'G',
    openingStock: 0,
    unitCost: 3,
    minStock: 20,
    reorderLevel: 40,
    targetStock: 100,
  });

  const archivedItem = await createItem({
    name: 'Archived Empty Stock ' + suffix,
    category: 'OTHER',
    unit: 'KG',
    openingStock: 0,
    unitCost: 10,
    minStock: 1,
    reorderLevel: 2,
    targetStock: 5,
  });
  await fetch(`${BASE_URL}/items/${archivedItem.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ isActive: false }),
  });

  const supplierRes = await fetch(`${BASE_URL}/suppliers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ name: 'Alert Vendor ' + suffix, phone: '+91 91111 22222' }),
  });
  const supplier = (await json(supplierRes)).supplier;
  await fetch(`${BASE_URL}/items/${outItem.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ supplierId: supplier.id }),
  });

  const alertsRes = await fetch(`${BASE_URL}/replenishment/alerts`, { headers: { Cookie: cookie } });
  const alerts = await json(alertsRes);
  assert(alertsRes.status === 200, 'GET /replenishment/alerts succeeded');
  assert(alerts.outOfStock.some((i: any) => i.id === outItem.id && i.status === 'OUT_OF_STOCK'), 'Out-of-stock item appears as out of stock');
  assert(alerts.lowStock.some((i: any) => i.id === lowItem.id && i.status === 'LOW_STOCK'), 'Low-stock detection at the minimum boundary');
  assert(!alerts.outOfStock.some((i: any) => i.id === healthyItem.id) && !alerts.lowStock.some((i: any) => i.id === healthyItem.id), 'Healthy item excluded from alerts');
  assert(!alerts.outOfStock.some((i: any) => i.id === archivedItem.id) && !alerts.lowStock.some((i: any) => i.id === archivedItem.id), 'Archived items excluded from alerts');

  const listRes = await fetch(`${BASE_URL}/replenishment/reorder-list`, { headers: { Cookie: cookie } });
  const list = await json(listRes);
  const byId = Object.fromEntries(list.items.map((i: any) => [i.id, i]));
  assert(listRes.status === 200, 'GET /replenishment/reorder-list succeeded');
  assert(!byId[healthyItem.id], 'Healthy item excluded from default reorder list');
  assert(!byId[archivedItem.id], 'Archived items excluded from reorder list');
  assert(byId[reorderItem.id].suggestedQty === 6, 'Suggested quantity = target − current (10 − 4 = 6)');
  assert(byId[outItem.id].suggestedQty === 10, 'Suggested quantity for empty item is full target');
  assert(byId[outItem.id].estimatedCost === 1000, 'Estimated cost = suggested quantity × unit cost');

  const healthyListRes = await fetch(`${BASE_URL}/replenishment/reorder-list?status=HEALTHY`, { headers: { Cookie: cookie } });
  const healthyList = await json(healthyListRes);
  const atTarget = healthyList.items.find((i: any) => i.id === atTargetItem.id);
  assert(atTarget && atTarget.suggestedQty === 0, 'Zero suggestion when stock is at target');
  const healthyRow = healthyList.items.find((i: any) => i.id === healthyItem.id);
  assert(healthyRow && healthyRow.suggestedQty === 0, 'Zero suggestion when stock is above target');

  const noneRes = await fetch(`${BASE_URL}/replenishment/reorder-list?supplierId=none`, { headers: { Cookie: cookie } });
  const noneList = await json(noneRes);
  assert(noneList.items.every((i: any) => !i.supplierId), 'Supplier grouping filter returns items without a supplier');
  assert(noneList.items.some((i: any) => i.id === noSupplierItem.id), 'Ungrouped out-of-stock item is in the without-supplier list');
  assert(list.bySupplier.some((g: any) => g.supplier?.id === supplier.id && g.items.some((i: any) => i.id === outItem.id)), 'Reorder list groups items by supplier');
  assert(list.bySupplier.some((g: any) => !g.supplier && g.items.some((i: any) => i.id === noSupplierItem.id)), 'Includes an items-without-a-supplier group');

  const badLevels = await fetch(`${BASE_URL}/items/${healthyItem.id}/levels`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ minStock: 8, reorderLevel: 3, targetStock: 10 }),
  });
  assert(badLevels.status === 400, 'Level validation rejects minimum > reorder');

  const goodLevels = await fetch(`${BASE_URL}/items/${healthyItem.id}/levels`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ minStock: 3, reorderLevel: 6, targetStock: 12 }),
  });
  const goodData = await json(goodLevels);
  assert(goodLevels.status === 200 && goodData.item.minStock === 3 && goodData.item.reorderLevel === 6, 'Valid min ≤ reorder ≤ target update succeeds');

  const beforeAlerts = (await json(await fetch(`${BASE_URL}/replenishment/alerts`, { headers: { Cookie: cookie } }))).lowStockCount;
  await fetch(`${BASE_URL}/transactions/usage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ itemId: reorderItem.id, quantity: 2, remarks: 'Drop to low stock' }),
  });
  const afterUsage = await json(await fetch(`${BASE_URL}/replenishment/alerts`, { headers: { Cookie: cookie } }));
  assert(afterUsage.lowStock.some((i: any) => i.id === reorderItem.id), 'Alerts update after a usage transaction');

  await fetch(`${BASE_URL}/transactions/purchase`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ itemId: outItem.id, quantity: 12, unitCost: 100, idempotencyKey: 'p5-buy-' + suffix }),
  });
  const afterPurchase = await json(await fetch(`${BASE_URL}/replenishment/alerts`, { headers: { Cookie: cookie } }));
  assert(!afterPurchase.outOfStock.some((i: any) => i.id === outItem.id), 'Alerts update after a purchase transaction');
  assert(afterUsage.lowStockCount !== undefined && beforeAlerts !== undefined, 'Alert counts available for sidebar badges');

  const summaryRes = await fetch(`${BASE_URL}/replenishment/summary`, { headers: { Cookie: cookie } });
  const summary = await json(summaryRes);
  assert(summaryRes.status === 200 && typeof summary.summary.totalEstimatedReorderCost === 'number', 'GET /replenishment/summary returns counts and estimated cost');

  const otherName = 'p5b_' + suffix;
  const otherReg = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: otherName, email: `${otherName}@tea.com`, password: 'Password123' }),
  });
  let cookie2 = cookieFrom(otherReg);
  const otherShop = await fetch(`${BASE_URL}/shop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie2 },
    body: JSON.stringify({ name: 'Other Shop', ownerName: 'Other', phone: '+91 90000 22222' }),
  });
  cookie2 = cookieFrom(otherShop, cookie2);
  const otherAlerts = await json(await fetch(`${BASE_URL}/replenishment/alerts`, { headers: { Cookie: cookie2 } }));
  assert(otherAlerts.outOfStock.length === 0 && otherAlerts.lowStock.length === 0, "Another shop's replenishment data is not visible");
  const cross = await fetch(`${BASE_URL}/items/${lowItem.id}/levels`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookie2 },
    body: JSON.stringify({ minStock: 1, reorderLevel: 2, targetStock: 3 }),
  });
  assert(cross.status === 404, "Another shop cannot update this shop's item levels");

  console.log(`\n🎉 ALL ${passed}/${total} PHASE 5 TEST CHECKLIST ASSERTIONS PASSED!\n`);
}

testPhase5().catch((err) => {
  console.error('Phase 5 Test Failed:', err);
  process.exit(1);
});
