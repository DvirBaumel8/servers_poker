#!/usr/bin/env node

const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function main() {
  rl.question('Enter your email: ', async (email) => {
    rl.question('Enter your new password: ', async (password) => {
      if (!email || !password) {
        console.error('Email and password cannot be empty');
        rl.close();
        process.exit(1);
      }

      const pool = new Pool({
        database: 'poker',
        host: 'localhost',
      });

      try {
        console.log('Generating bcrypt hash...');
        const hash = await bcrypt.hash(password, 12);
        console.log('✓ Hash generated\n');

        console.log('Updating database...');
        const result = await pool.query(
          'UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING id, email',
          [hash, email]
        );

        if (result.rows.length === 0) {
          console.error(`❌ User not found with email: ${email}`);
          process.exit(1);
        }

        const user = result.rows[0];
        console.log(`✓ Password updated for: ${user.email}`);
        console.log('\nYou can now log in!');
        await pool.end();
        rl.close();
      } catch (error) {
        console.error('Error:', error.message);
        await pool.end();
        rl.close();
        process.exit(1);
      }
    });
  });
}

main();
