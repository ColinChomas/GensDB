const db = require('./db');

async function createHouse(gensName, founderId = null) {
  const [result] = await db.execute(
    `INSERT INTO house (gens_name, founder_id)
     VALUES (?, ?)`,
    [gensName, founderId]
  );
  return result.insertId;
}

async function getHouseById(id) {
  const [rows] = await db.execute(
    `SELECT * FROM house WHERE id = ?`,
    [id]
  );
  return rows[0] || null;
}

module.exports = { createHouse, getHouseById };