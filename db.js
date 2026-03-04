const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'W!lliam128',
  database: 'gensDB',
});

module.exports = pool;