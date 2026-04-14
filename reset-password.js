#!/usr/bin/env node

const bcrypt = require('bcrypt');
const { execSync } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function main() {
  rl.question('Enter your email: ', (email) => {
    rl.question('Enter your new password: ', async (password) => {
      if (!email || !password) {
        console.error('Email and password cannot be empty');
        rl.close();
        process.exit(1);
      }

      try {
        console.log('Generating bcrypt hash...');
        const hash = await bcrypt.hash(password, 10);
        console.log('\n✓ Hash generated successfully\n');
        console.log('Running database update...\n');

        execSync(
          `psql -d poker -c "UPDATE users SET password_hash = '${hash}' WHERE email = '${email}' RETURNING id, email;"`,
          { stdio: 'inherit' }
        );

        console.log('\n✓ Password updated! You can now log in.');
        rl.close();
      } catch (error) {
        console.error('Error:', error.message);
        rl.close();
        process.exit(1);
      }
    });
  });
}

main();
