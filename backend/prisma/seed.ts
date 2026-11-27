import { PrismaClient, Role, ItemCategory, ItemUnit, TransactionType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const seedEmail = process.env.SEED_OWNER_EMAIL?.trim();
  const seedUsername = process.env.SEED_OWNER_USERNAME?.trim().toLowerCase();
  const seedPassword = process.env.SEED_OWNER_PASSWORD;
  const seedName = process.env.SEED_OWNER_NAME?.trim() || 'Shop Owner';

  if (!seedEmail || !seedUsername || !seedPassword) {
    throw new Error('Set SEED_OWNER_EMAIL, SEED_OWNER_USERNAME, and SEED_OWNER_PASSWORD before seeding.');
  }
  if (seedPassword.length < 8) {
    throw new Error('SEED_OWNER_PASSWORD must be at least 8 characters.');
  }

  console.log('🌱 Starting ShopTea database seeding...');

  // 1. Create Sample Shop
  const shop = await prisma.shop.upsert({
    where: { id: 'seed-shop-001' },
    update: {},
    create: {
      id: 'seed-shop-001',
      name: 'Chai Charcha & Co.',
      ownerName: 'Rajesh Sharma',
      phone: '+91 98765 43210',
      address: 'Shop 4, Market Complex, MG Road, Pune, Maharashtra',
      currency: 'INR',
    },
  });
  console.log(`✅ Created Shop: ${shop.name} (${shop.id})`);

  // 2. Create Owner User
  const hashedPassword = await bcrypt.hash(seedPassword, 10);
  const user = await prisma.user.upsert({
    where: { email: seedEmail },
    update: {
      username: seedUsername,
      isEmailVerified: true,
      shopId: shop.id,
      name: seedName,
      password: hashedPassword,
    },
    create: {
      username: seedUsername,
      email: seedEmail,
      password: hashedPassword,
      name: seedName,
      role: Role.OWNER,
      isEmailVerified: true,
      shopId: shop.id,
    },
  });
  console.log(`✅ Created Owner: ${user.name} (@${user.username}, ${user.email})`);

  // 3. Create Tea Shop Suppliers
  const supplier1 = await prisma.supplier.create({
    data: {
      shopId: shop.id,
      name: 'Assam Gold Tea Traders',
      phone: '+91 98220 11223',
      email: 'sales@assamgoldtea.com',
      address: 'Guwahati, Assam',
      notes: 'Primary supplier for CTC and Orthodox tea leaves. 3-day delivery.',
    },
  });

  const supplier2 = await prisma.supplier.create({
    data: {
      shopId: shop.id,
      name: 'Gokul Dairy Fresh',
      phone: '+91 98900 33445',
      email: 'orders@gokuldairy.com',
      address: 'Hadapsar, Pune',
      notes: 'Daily morning delivery of full cream buffalo milk.',
    },
  });

  const supplier3 = await prisma.supplier.create({
    data: {
      shopId: shop.id,
      name: 'Pooja Packaging & Disposables',
      phone: '+91 97654 55667',
      address: 'Raviwar Peth, Pune',
      notes: 'Cups, lids, paper stirrers and parcel carry bags.',
    },
  });
  console.log(`✅ Created 3 Tea Shop Suppliers`);

  // 4. Create Core Tea Shop Inventory Items
  const itemsData = [
    {
      name: 'Assam CTC Premium Tea Leaf',
      category: ItemCategory.TEA_LEAVES,
      unit: ItemUnit.KG,
      openingStock: 25.0,
      currentStock: 25.0,
      unitCost: 380.0,
      minStock: 5.0,
      reorderLevel: 8.0,
      targetStock: 30.0,
      supplierId: supplier1.id,
    },
    {
      name: 'Darjeeling Green Tea Blend',
      category: ItemCategory.TEA_LEAVES,
      unit: ItemUnit.KG,
      openingStock: 6.0,
      currentStock: 6.0,
      unitCost: 750.0,
      minStock: 1.5,
      reorderLevel: 2.5,
      targetStock: 8.0,
      supplierId: supplier1.id,
    },
    {
      name: 'Full Cream Buffalo Milk',
      category: ItemCategory.DAIRY,
      unit: ItemUnit.LITRES,
      openingStock: 40.0,
      currentStock: 40.0,
      unitCost: 68.0,
      minStock: 10.0,
      reorderLevel: 15.0,
      targetStock: 50.0,
      supplierId: supplier2.id,
    },
    {
      name: 'Cardamom (Elaichi) Whole',
      category: ItemCategory.SPICES,
      unit: ItemUnit.G,
      openingStock: 1000.0, // 1000 grams
      currentStock: 1000.0,
      unitCost: 3.2, // ₹3.20 per gram
      minStock: 200.0,
      reorderLevel: 350.0,
      targetStock: 1500.0,
      supplierId: null,
    },
    {
      name: 'Fresh Ginger (Adrak)',
      category: ItemCategory.SPICES,
      unit: ItemUnit.KG,
      openingStock: 8.0,
      currentStock: 8.0,
      unitCost: 90.0,
      minStock: 2.0,
      reorderLevel: 3.0,
      targetStock: 10.0,
      supplierId: null,
    },
    {
      name: 'White Refined Sugar',
      category: ItemCategory.SWEETENERS,
      unit: ItemUnit.KG,
      openingStock: 50.0,
      currentStock: 50.0,
      unitCost: 44.0,
      minStock: 10.0,
      reorderLevel: 15.0,
      targetStock: 60.0,
      supplierId: null,
    },
    {
      name: 'Organic Jaggery Powder',
      category: ItemCategory.SWEETENERS,
      unit: ItemUnit.KG,
      openingStock: 12.0,
      currentStock: 12.0,
      unitCost: 85.0,
      minStock: 3.0,
      reorderLevel: 4.5,
      targetStock: 15.0,
      supplierId: null,
    },
    {
      name: 'Paper Cups 150ml',
      category: ItemCategory.PACKAGING,
      unit: ItemUnit.PIECES,
      openingStock: 2000.0,
      currentStock: 2000.0,
      unitCost: 0.85,
      minStock: 400.0,
      reorderLevel: 600.0,
      targetStock: 3000.0,
      supplierId: supplier3.id,
    },
    {
      name: 'Wooden Stirrers (Pack of 100)',
      category: ItemCategory.PACKAGING,
      unit: ItemUnit.PACKETS,
      openingStock: 20.0,
      currentStock: 20.0,
      unitCost: 35.0,
      minStock: 5.0,
      reorderLevel: 7.0,
      targetStock: 25.0,
      supplierId: supplier3.id,
    },
  ];

  for (const item of itemsData) {
    const createdItem = await prisma.inventoryItem.create({
      data: {
        shopId: shop.id,
        ...item,
      },
    });

    if (item.openingStock > 0) {
      await prisma.stockTransaction.create({
        data: {
          shopId: shop.id,
          itemId: createdItem.id,
          type: TransactionType.PURCHASE,
          quantity: item.openingStock,
          unitCost: item.unitCost,
          totalCost: item.openingStock * item.unitCost,
          supplierId: item.supplierId,
          reference: 'OPENING-STOCK',
          remarks: 'Initial inventory balance setup',
        },
      });
    }
  }

  console.log(`✅ Created ${itemsData.length} Tea Shop Inventory Items with Initial Transactions`);
  console.log('🎉 Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
