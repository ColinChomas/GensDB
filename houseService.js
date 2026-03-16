const db = require('./db');
const { validateString, validateId } = require('./validators');

async function createHouse(gensName, founderId = null) {
  // Validate inputs
  gensName = validateString(gensName, 150, 'House Name');
  if (founderId) founderId = validateId(founderId, 'Founder ID');

  const [result] = await db.execute(
    `INSERT INTO house (gens_name, founder_id)
     VALUES (?, ?)`,
    [gensName, founderId || null]
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