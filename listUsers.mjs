import mysql from 'mysql2/promise';

async function main() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'vero_db'
  });
  
  const [rows] = await connection.execute('SELECT email, password FROM users');
  console.log("Found users:");
  console.dir(rows, { depth: null });
  
  await connection.end();
}

main().catch(console.error);
