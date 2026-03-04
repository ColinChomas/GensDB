const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: 'localhost',
  user: process.env.SQLUSER,
  password: process.env.SQLPASSWORD,
  database: 'gensDB',
});

module.exports = pool;