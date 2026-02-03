require('dotenv').config();
const { initDatabase, db } = require('../db');
const bcrypt = require('bcrypt');

async function createAdmin() {
  try {
    await initDatabase();
    
    const email = process.argv[2] || 'admin@example.com';
    const password = process.argv[3] || 'admin123';
    
    console.log(`Creating admin user with email: ${email}`);
    
    const existingUser = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    
    if (existingUser.rows.length > 0) {
      console.log('User already exists. Updating role to admin...');
      await db.query('UPDATE users SET role = $1 WHERE email = $2', ['admin', email]);
      console.log(`✅ User ${email} is now an admin!`);
      console.log(`You can now log in with:`);
      console.log(`Email: ${email}`);
      console.log(`Password: ${password}`);
    } else {
      const passwordHash = await bcrypt.hash(password, 10);
      const userId = db.generateUUID();
      
      await db.query(
        'INSERT INTO users (id, email, password_hash, role) VALUES ($1, $2, $3, $4)',
        [userId, email, passwordHash, 'admin']
      );
      
      console.log(`✅ Admin user created successfully!`);
      console.log(`You can now log in with:`);
      console.log(`Email: ${email}`);
      console.log(`Password: ${password}`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error creating admin:', error);
    process.exit(1);
  }
}

createAdmin();

