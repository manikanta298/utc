require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Franchise = require('../models/Franchise');
const MenuItem = require('../models/MenuItem');
const Customer = require('../models/Customer');

const seed = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✓ Connected to MongoDB');

  await Promise.all([
    User.deleteMany({}),
    Franchise.deleteMany({}),
    MenuItem.deleteMany({}),
    Customer.deleteMany({}),
  ]);
  console.log('✓ Cleared existing data');

  const masterAdmin = await User.create({
    name: 'Master Admin',
    email: 'manikantakambala12@gmail.com',
    password: 'Admin@1234',
    role: 'master_admin',
    phone: '9000000000',
  });
  console.log('✓ Master Admin created');

  const franchise1 = await Franchise.create({
    name: 'UTC Café — Chennai Central',
    location: 'Anna Salai, Chennai',
    city: 'Chennai',
    state: 'Tamil Nadu',
    gstin: '33AABCU9603R1ZX',
    phone: '9111111111',
    email: 'chennai@utccafe.com',
    address: '45, Anna Salai, Chennai - 600002',
  });

  const franchise2 = await Franchise.create({
    name: 'UTC Café — Bangalore Koramangala',
    location: 'Koramangala, Bangalore',
    city: 'Bangalore',
    state: 'Karnataka',
    gstin: '29AABCU9603R1ZY',
    phone: '9222222222',
    email: 'bangalore@utccafe.com',
    address: '12, 5th Block, Koramangala, Bangalore - 560034',
  });
  console.log('✓ 2 Franchises created');

  const owner1 = await User.create({
    name: 'Raj Kumar',
    email: 'raj@utccafe.com',
    password: 'Owner@1234',
    role: 'franchise_owner',
    franchise_id: franchise1._id,
    phone: '9111111112',
  });
  const owner2 = await User.create({
    name: 'Priya Sharma',
    email: 'priya@utccafe.com',
    password: 'Owner@1234',
    role: 'franchise_owner',
    franchise_id: franchise2._id,
    phone: '9222222223',
  });

  await Franchise.findByIdAndUpdate(franchise1._id, { owner_id: owner1._id });
  await Franchise.findByIdAndUpdate(franchise2._id, { owner_id: owner2._id });

  await User.create([
    { name: 'Suresh M',      email: 'manager1@utccafe.com',  password: 'Staff@1234', role: 'manager',       franchise_id: franchise1._id, phone: '9111111113' },
    { name: 'Kavya POS',     email: 'pos1@utccafe.com',      password: 'Staff@1234', role: 'pos_staff',     franchise_id: franchise1._id, phone: '9111111114' },
    { name: 'Ravi Kitchen',  email: 'kitchen1@utccafe.com',  password: 'Staff@1234', role: 'kitchen_staff', franchise_id: franchise1._id, phone: '9111111115' },
    { name: 'Anita M',       email: 'manager2@utccafe.com',  password: 'Staff@1234', role: 'manager',       franchise_id: franchise2._id, phone: '9222222224' },
    { name: 'Deepak POS',    email: 'pos2@utccafe.com',      password: 'Staff@1234', role: 'pos_staff',     franchise_id: franchise2._id, phone: '9222222225' },
    { name: 'Mohan Kitchen', email: 'kitchen2@utccafe.com',  password: 'Staff@1234', role: 'kitchen_staff', franchise_id: franchise2._id, phone: '9222222226' },
  ]);
  console.log('✓ Staff created');

  await MenuItem.insertMany([
    { name: 'Masala Chai',               category: 'Beverages', price: 30,  gst_rate: 5,  hsn_code: '2101', isVeg: true,  preparationTime: 5  },
    { name: 'Filter Coffee',             category: 'Beverages', price: 40,  gst_rate: 5,  hsn_code: '2101', isVeg: true,  preparationTime: 5  },
    { name: 'Cold Coffee',               category: 'Beverages', price: 90,  gst_rate: 5,  hsn_code: '2101', isVeg: true,  preparationTime: 7  },
    { name: 'Mango Lassi',               category: 'Beverages', price: 70,  gst_rate: 5,  hsn_code: '2202', isVeg: true,  preparationTime: 5  },
    { name: 'Fresh Lime Soda',           category: 'Beverages', price: 60,  gst_rate: 5,  hsn_code: '2202', isVeg: true,  preparationTime: 3  },
    { name: 'Samosa (2 pcs)',            category: 'Snacks',    price: 40,  gst_rate: 5,  hsn_code: '1905', isVeg: true,  preparationTime: 8  },
    { name: 'Veg Sandwich',             category: 'Snacks',    price: 80,  gst_rate: 5,  hsn_code: '1905', isVeg: true,  preparationTime: 10 },
    { name: 'Chicken Sandwich',          category: 'Snacks',    price: 120, gst_rate: 5,  hsn_code: '1905', isVeg: false, preparationTime: 12 },
    { name: 'French Fries',              category: 'Snacks',    price: 90,  gst_rate: 5,  hsn_code: '2004', isVeg: true,  preparationTime: 8  },
    { name: 'Veg Thali',                 category: 'Meals',     price: 160, gst_rate: 5,  hsn_code: '2106', isVeg: true,  preparationTime: 15 },
    { name: 'Chicken Biryani',           category: 'Meals',     price: 220, gst_rate: 5,  hsn_code: '1904', isVeg: false, preparationTime: 20 },
    { name: 'Paneer Butter Masala+Naan', category: 'Meals',     price: 200, gst_rate: 5,  hsn_code: '2106', isVeg: true,  preparationTime: 18 },
    { name: 'Gulab Jamun',               category: 'Desserts',  price: 60,  gst_rate: 5,  hsn_code: '1905', isVeg: true,  preparationTime: 5  },
    { name: 'Kulfi Falooda',             category: 'Desserts',  price: 90,  gst_rate: 5,  hsn_code: '2105', isVeg: true,  preparationTime: 5  },
    { name: 'UTC Special Combo',         category: 'Specials',  price: 299, gst_rate: 5,  hsn_code: '2106', isVeg: false, preparationTime: 20, sortOrder: 1 },
    { name: 'Breakfast Platter',         category: 'Specials',  price: 180, gst_rate: 5,  hsn_code: '1905', isVeg: true,  preparationTime: 15, sortOrder: 2 },
  ]);
  console.log('✓ Menu items created');

  await Customer.create([
    { phone_no: '9800000001', name: 'Arjun Patel',  email: 'arjun@email.com', total_points: 150, first_franchise: franchise1._id },
    { phone_no: '9800000002', name: 'Meena Reddy',  email: 'meena@email.com', total_points: 320, first_franchise: franchise1._id },
    { phone_no: '9800000003', name: 'Vijay Singh',                             total_points: 75,  first_franchise: franchise2._id },
    { phone_no: '9800000004', name: 'Sunita Devi',                             total_points: 500, first_franchise: franchise2._id },
  ]);
  console.log('✓ Sample customers created');

  console.log('\n═══════════════════════════════════════════════');
  console.log('  UTC CAFÉ — SEED COMPLETE');
  console.log('  MASTER ADMIN:  manikantakambala12@gmail.com / Admin@1234');
  console.log('  OWNER Chennai: raj@utccafe.com   / Owner@1234');
  console.log('  OWNER Blr:     priya@utccafe.com / Owner@1234');
  console.log('  MANAGER:       manager1@utccafe.com / Staff@1234');
  console.log('  POS STAFF:     pos1@utccafe.com     / Staff@1234');
  console.log('  KITCHEN:       kitchen1@utccafe.com / Staff@1234');
  console.log('═══════════════════════════════════════════════\n');

  await mongoose.disconnect();
  process.exit(0);
};

seed().catch((err) => { console.error(err); process.exit(1); });
