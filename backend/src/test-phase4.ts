async function testPhase4() {
  console.log('🧪 Starting Phase 4: Stock Transactions & Suppliers Verification Suite...\n');
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

  // 1. Log in as the configured local seed owner
  const seedIdentifier = process.env.SEED_OWNER_EMAIL;
  const seedPassword = process.env.SEED_OWNER_PASSWORD;
  if (!seedIdentifier || !seedPassword) {
    throw new Error('Set SEED_OWNER_EMAIL and SEED_OWNER_PASSWORD before running this local seed test.');
  }
  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: seedIdentifier, password: seedPassword }),
  });
  const cookie = loginRes.headers.get('set-cookie') || '';
  assert(loginRes.status === 200, 'Authenticated as the configured local seed owner');

  // 2. Fetch inventory items to obtain a base item
  const itemsRes = await fetch(`${BASE_URL}/items`, {
    headers: { Cookie: cookie },
  });
  const itemsData = await itemsRes.json();
  const teaLeaf = itemsData.items.find((i: any) => i.name.includes('Assam CTC'));
  const paperCups = itemsData.items.find((i: any) => i.unit === 'PIECES');
  assert(teaLeaf && paperCups, 'Retrieved tea shop items (Assam CTC and Paper Cups)');

  const initialTeaStock = Number(teaLeaf.currentStock);
  console.log(`\n📦 Starting Assam CTC Stock: ${initialTeaStock} ${teaLeaf.unit}`);

  // Test 1: Purchase increases stock correctly and updates unit cost
  const idempPurchase = 'idemp-pur-' + Date.now();
  const purRes = await fetch(`${BASE_URL}/transactions/purchase`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      itemId: teaLeaf.id,
      quantity: 10,
      unitCost: 395.5,
      supplierId: teaLeaf.supplierId,
      reference: 'INV-2026-99',
      remarks: 'Fresh batch from Assam',
      idempotencyKey: idempPurchase,
    }),
  });
  const purData = await purRes.json();
  assert(purRes.status === 201, 'Purchase request succeeded (HTTP 201)');
  assert(Number(purData.newStock) === initialTeaStock + 10, 'Stock increased by 10 KG');
  const expectedWeightedCost = Number(((initialTeaStock * Number(teaLeaf.unitCost) + 10 * 395.5) / (initialTeaStock + 10)).toFixed(2));
  assert(purData.updatedItem.unitCost === expectedWeightedCost, `Item unit cost uses weighted average (${expectedWeightedCost})`);

  // Test 2: Idempotent duplicate purchase creates only 1 record and returns original
  const dupPurRes = await fetch(`${BASE_URL}/transactions/purchase`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      itemId: teaLeaf.id,
      quantity: 10,
      unitCost: 395.5,
      supplierId: teaLeaf.supplierId,
      idempotencyKey: idempPurchase,
    }),
  });
  const dupPurData = await dupPurRes.json();
  assert(dupPurRes.status === 200 && dupPurData.isDuplicate, 'Duplicate idempotency key handled (HTTP 200, isDuplicate=true)');
  const itemAfterDup = (await (await fetch(`${BASE_URL}/items/${teaLeaf.id}`, { headers: { Cookie: cookie } })).json()).item;
  assert(Number(itemAfterDup.currentStock) === initialTeaStock + 10, 'Stock balance did not increase twice');

  // Test 3: Usage decreases stock correctly
  const useRes = await fetch(`${BASE_URL}/transactions/usage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      itemId: teaLeaf.id,
      quantity: 5,
      remarks: 'Morning batch masala chai prep',
    }),
  });
  const useData = await useRes.json();
  assert(useRes.status === 201, 'Usage recorded successfully (HTTP 201)');
  assert(Number(useData.newStock) === initialTeaStock + 10 - 5, 'Stock decreased by 5 KG');

  // Test 4: Wastage decreases stock and records reason
  const wasteRes = await fetch(`${BASE_URL}/transactions/wastage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      itemId: teaLeaf.id,
      quantity: 2,
      wastageReason: 'DAMAGED',
      remarks: 'Moisture in bag',
    }),
  });
  const wasteData = await wasteRes.json();
  assert(wasteRes.status === 201, 'Wastage recorded successfully (HTTP 201)');
  assert(Number(wasteData.newStock) === initialTeaStock + 10 - 5 - 2, 'Stock decreased by 2 KG');
  assert(wasteData.transaction.wastageReason === 'DAMAGED', 'Wastage reason stored in transaction record');

  // Test 5: Negative stock is strictly blocked
  const overdrawRes = await fetch(`${BASE_URL}/transactions/usage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      itemId: teaLeaf.id,
      quantity: 9999,
      remarks: 'Attempted overdraw',
    }),
  });
  const overdrawData = await overdrawRes.json();
  assert(overdrawRes.status === 400, 'Negative stock blocked with HTTP 400');
  assert(overdrawData.message.includes('Insufficient stock'), 'Returns clear message with available stock');

  // Test 6: Zero and negative quantities rejected
  const zeroQtyRes = await fetch(`${BASE_URL}/transactions/usage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ itemId: teaLeaf.id, quantity: 0 }),
  });
  assert(zeroQtyRes.status === 400, 'Zero quantity rejected (HTTP 400)');

  const negQtyRes = await fetch(`${BASE_URL}/transactions/usage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ itemId: teaLeaf.id, quantity: -5 }),
  });
  assert(negQtyRes.status === 400, 'Negative quantity rejected (HTTP 400)');

  // Test 7: Whole-number rule for pieces and packets
  const fractionalPieceRes = await fetch(`${BASE_URL}/transactions/usage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ itemId: paperCups.id, quantity: 15.5, remarks: 'Fractional cups' }),
  });
  assert(fractionalPieceRes.status === 400, 'Fractional quantity (15.5) for PIECES rejected (HTTP 400)');

  const validPieceRes = await fetch(`${BASE_URL}/transactions/usage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ itemId: paperCups.id, quantity: 50, remarks: 'Valid cups count' }),
  });
  assert(validPieceRes.status === 201, 'Whole number quantity (50) for PIECES accepted (HTTP 201)');

  // Test 8: Future date rejected
  const futureDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
  const futureRes = await fetch(`${BASE_URL}/transactions/usage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ itemId: teaLeaf.id, quantity: 1, date: futureDate }),
  });
  assert(futureRes.status === 400, 'Future transaction date rejected (HTTP 400)');

  // Test 9: Counting Adjustment (INCREASE and DECREASE)
  const adjIncRes = await fetch(`${BASE_URL}/transactions/adjustment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      itemId: teaLeaf.id,
      quantity: 3,
      adjustmentType: 'INCREASE',
      remarks: 'Found extra unopened pouch during shelf count',
    }),
  });
  const adjIncData = await adjIncRes.json();
  assert(adjIncRes.status === 201, 'Adjustment INCREASE succeeded (HTTP 201)');

  const adjDecRes = await fetch(`${BASE_URL}/transactions/adjustment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      itemId: teaLeaf.id,
      quantity: 1,
      adjustmentType: 'DECREASE',
      remarks: 'Scale calibration adjustment',
    }),
  });
  assert(adjDecRes.status === 201, 'Adjustment DECREASE succeeded (HTTP 201)');

  // Test 10: Archived item cannot receive transactions
  const newItemRes = await fetch(`${BASE_URL}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      name: 'Seasonal Lemon Tea ' + Date.now(),
      category: 'TEA_LEAVES',
      unit: 'KG',
      openingStock: 10,
      unitCost: 200,
    }),
  });
  const seasonalItem = (await newItemRes.json()).item;
  // Archive it
  await fetch(`${BASE_URL}/items/${seasonalItem.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ isActive: false }),
  });
  // Attempt transaction on archived item
  const archivedTxRes = await fetch(`${BASE_URL}/transactions/usage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ itemId: seasonalItem.id, quantity: 1 }),
  });
  assert(archivedTxRes.status === 400, 'Archived item transaction rejected (HTTP 400)');

  // Test 11: Multi-tenant protection (another shop cannot access or modify items)
  // Create second user & shop
  const u2Name = 'shop2_' + Date.now();
  const reg2Res = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: u2Name, email: u2Name + '@tea.com', password: 'Password123' }),
  });
  const reg2 = await reg2Res.json();
  const cookie2 = reg2Res.headers.get('set-cookie') || '';
  assert(reg2Res.status === 201 && Boolean(cookie2), 'Registration immediately creates a signed-in account');
  await fetch(`${BASE_URL}/shop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie2 },
    body: JSON.stringify({ name: 'Shop Two Chai Bar', ownerName: 'Owner Two', phone: '+91 99999 88888' }),
  });
  // Shop 2 attempts to transact on Shop 1's item
  const crossShopRes = await fetch(`${BASE_URL}/transactions/usage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie2 },
    body: JSON.stringify({ itemId: teaLeaf.id, quantity: 1 }),
  });
  assert(crossShopRes.status === 404, 'Cross-tenant transaction blocked with HTTP 404');

  // Test 12: Supplier CRUD & Purchase History
  const newSupRes = await fetch(`${BASE_URL}/suppliers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      name: 'Organic Spices Co. ' + Date.now(),
      phone: '+91 98450 12345',
      address: 'Spice Market, Kochi',
    }),
  });
  const newSup = (await newSupRes.json()).supplier;
  assert(newSupRes.status === 201, 'Supplier added successfully (HTTP 201)');

  const supPurchasesRes = await fetch(`${BASE_URL}/suppliers/${teaLeaf.supplierId}/purchases`, {
    headers: { Cookie: cookie },
  });
  const supPurchasesData = await supPurchasesRes.json();
  assert(supPurchasesRes.status === 200, 'Supplier purchase history retrieved (HTTP 200)');
  assert(Array.isArray(supPurchasesData.purchases) && supPurchasesData.summary.totalPurchases >= 1, 'Supplier history lists recorded purchases and total spent');

  // Test 13: Transaction history filtering & pagination
  const historyRes = await fetch(`${BASE_URL}/transactions?type=PURCHASE&page=1&limit=5`, {
    headers: { Cookie: cookie },
  });
  const historyData = await historyRes.json();
  assert(historyRes.status === 200, 'Transaction history retrieved with pagination (HTTP 200)');
  assert(historyData.transactions.every((t: any) => t.type === 'PURCHASE'), 'History accurately filters by transaction type');

  console.log(`\n🎉 ALL ${passed}/${total} PHASE 4 TEST CHECKLIST ASSERTIONS PASSED!\n`);
}

testPhase4().catch((err) => {
  console.error('Phase 4 Test Failed:', err);
  process.exit(1);
});
