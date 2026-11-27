import bcrypt from 'bcryptjs';
import {
  registerSchema,
  loginSchema,
  createShopSchema,
} from './validations/auth.validation';
import {
  signAuthToken,
  verifyAuthToken,
  getAuthCookieOptions,
} from './utils/token';

async function runAuthTests() {
  console.log('🧪 Starting Phase 2: Authentication & Security Unit Tests...\n');
  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string) {
    total++;
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}`);
      throw new Error(`Test failed: ${testName}`);
    }
  }

  // 1. Validation: Username rules (4-20 chars, case-insensitive lowercase, letters/numbers/underscore)
  console.log('1. Testing Username Validation Rules:');
  const validUser = registerSchema.safeParse({
    username: 'Chai_Wala99',
    email: 'tea@shop.com',
    password: 'Password123',
  });
  assert(validUser.success && validUser.data.username === 'chai_wala99', 'Username is lowercased and accepted');

  const shortUser = registerSchema.safeParse({
    username: 'tea',
    email: 'tea@shop.com',
    password: 'Password123',
  });
  assert(!shortUser.success, 'Rejects username with less than 4 characters');

  const invalidCharUser = registerSchema.safeParse({
    username: 'chai-master@pune',
    email: 'tea@shop.com',
    password: 'Password123',
  });
  assert(!invalidCharUser.success, 'Rejects username with invalid special characters (- and @)');

  // 2. Validation: Password rules (min 8 chars, at least one letter and one number)
  console.log('\n2. Testing Password Security Rules:');
  const noNumberPass = registerSchema.safeParse({
    username: 'teafarmer',
    email: 'tea@farm.com',
    password: 'passwordonly',
  });
  assert(!noNumberPass.success, 'Rejects password with no numbers');

  const noLetterPass = registerSchema.safeParse({
    username: 'teafarmer',
    email: 'tea@farm.com',
    password: '12345678',
  });
  assert(!noLetterPass.success, 'Rejects password with no letters');

  const validPass = registerSchema.safeParse({
    username: 'teafarmer',
    email: 'tea@farm.com',
    password: 'Secret123',
  });
  assert(validPass.success, 'Accepts strong password with minimum 8 chars, letters, and numbers');

  // 3. Validation: Login single identifier input
  console.log('\n3. Testing Login Identifier:');
  const loginByEmail = loginSchema.safeParse({
    identifier: 'OWNER@TEASHOP.COM',
    password: 'Password123',
  });
  assert(loginByEmail.success && loginByEmail.data.identifier === 'owner@teashop.com', 'Accepts email and lowercases identifier');

  const loginByUsername = loginSchema.safeParse({
    identifier: 'Chai_King',
    password: 'Password123',
  });
  assert(loginByUsername.success && loginByUsername.data.identifier === 'chai_king', 'Accepts username and lowercases identifier');

  // 4. Bcrypt Password Hashing Test
  console.log('\n4. Testing Bcrypt Password Hashing & Verification:');
  const rawPassword = 'TeaBrewMaster#2026';
  const hashedPassword = await bcrypt.hash(rawPassword, 10);
  assert(hashedPassword !== rawPassword, 'Bcrypt securely hashes plaintext password');
  assert(await bcrypt.compare(rawPassword, hashedPassword), 'Bcrypt correctly matches valid password');
  assert(!(await bcrypt.compare('WrongPassword', hashedPassword)), 'Bcrypt correctly rejects invalid password');

  // 5. JWT Authentication & Payload Integrity
  console.log('\n5. Testing JWT Signing, Verification, and Payload:');
  const testPayload = {
    userId: 'usr_test_123',
    username: 'chai_owner',
    email: 'chai@owner.com',
    shopId: 'shp_test_456',
  };
  const jwtToken = signAuthToken(testPayload);
  assert(typeof jwtToken === 'string' && jwtToken.split('.').length === 3, 'Signs valid 3-part JWT string');

  const verified = verifyAuthToken(jwtToken);
  assert(verified.userId === testPayload.userId, 'JWT payload contains correct userId');
  assert(verified.username === testPayload.username, 'JWT payload contains correct username');
  assert(verified.shopId === testPayload.shopId, 'JWT payload contains correct shopId');

  // 6. Cookie Security Settings
  console.log('\n6. Testing Cookie Security Options:');
  const cookieOpts = getAuthCookieOptions();
  assert(cookieOpts.httpOnly === true, 'Cookie has httpOnly: true (inaccessible to JS/XSS)');
  assert(cookieOpts.path === '/', 'Cookie path is root (/)');
  assert(cookieOpts.maxAge === 7 * 24 * 60 * 60 * 1000, 'Cookie expiry is 7 days');

  // 7. Shop Setup Validation
  console.log('\n7. Testing Shop Setup Validation Rules:');
  const validShop = createShopSchema.safeParse({
    name: 'Chai Charcha Hub',
    ownerName: 'Rajesh Sharma',
    phone: '+91 9876543210',
    address: 'FC Road, Pune',
    currency: 'INR',
  });
  assert(validShop.success, 'Valid shop profile accepted');

  const invalidPhoneShop = createShopSchema.safeParse({
    name: 'Chai Charcha Hub',
    ownerName: 'Rajesh Sharma',
    phone: '123',
  });
  assert(!invalidPhoneShop.success, 'Rejects invalid short phone number');

  console.log(`\n🎉 All ${passed}/${total} Phase 2 Authentication & Security Tests Passed!\n`);
}

runAuthTests().catch((e) => {
  console.error('Test suite failed:', e);
  process.exit(1);
});
