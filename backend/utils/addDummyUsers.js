require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Franchise = require('../models/Franchise');

const DUMMY_PASSWORD = '9553963678';

const seed = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✓ Connected to MongoDB');

  // Find first active franchise to attach staff to
  let franchise = await Franchise.findOne();

  if (!franchise) {
    franchise = await Franchise.create({
      name: 'UTC Café',
      location: 'Kakinada, Andhra Pradesh',
      city: 'Kakinada',
      state: 'Andhra Pradesh',
      gstin: '37AABCU9603R1ZZ',
      phone: '9553963678',
      email: 'utc@gmail.com',
      address: 'Kakinada - 533001',
    });
    console.log('✓ Created demo franchise (no franchise existed)');
  } else {
    console.log(`✓ Using existing franchise: ${franchise.name}`);
  }

  const users = [
    { name: 'UTC POS',      email: 'utc1@gmail.com', role: 'pos_staff',       franchise_id: franchise._id, phone: '9553963671' },
    { name: 'UTC Waiter',   email: 'utc2@gmail.com', role: 'waiter',          franchise_id: franchise._id, phone: '9553963672' },
    { name: 'UTC Kitchen',  email: 'utc3@gmail.com', role: 'kitchen_staff',   franchise_id: franchise._id, phone: '9553963673' },
    { name: 'UTC Owner',    email: 'utc@gmail.com',  role: 'franchise_owner', franchise_id: franchise._id, phone: '9553963678' },
  ];

  for (const u of users) {
    const existing = await User.findOne({ email: u.email });
    if (existing) {
      existing.name        = u.name;
      existing.role        = u.role;
      existing.franchise_id = u.franchise_id;
      existing.phone       = u.phone;
      existing.password    = DUMMY_PASSWORD; // triggers bcrypt pre-save hook
      existing.isActive    = true;
      await existing.save();
      console.log(`✓ Updated: ${u.email} → ${u.role}`);
    } else {
      await User.create({ ...u, password: DUMMY_PASSWORD });
      console.log(`✓ Created: ${u.email} → ${u.role}`);
    }
  }

  // If franchise owner was just created, link franchise.owner_id
  const owner = await User.findOne({ email: 'utc@gmail.com' });
  if (owner) {
    await Franchise.findByIdAndUpdate(franchise._id, { owner_id: owner._id });
  }

  console.log('\n═══════════════════════════════════════════════');
  console.log('  DUMMY LOGINS — PASSWORD FOR ALL: 9553963678');
  console.log('  utc1@gmail.com  → POS Staff');
  console.log('  utc2@gmail.com  → Waiter');
  console.log('  utc3@gmail.com  → Kitchen Staff');
  console.log('  utc@gmail.com   → Franchise Owner');
  console.log('═══════════════════════════════════════════════\n');

  await mongoose.disconnect();
  process.exit(0);
};

seed().catch((err) => { console.error(err); process.exit(1); });
