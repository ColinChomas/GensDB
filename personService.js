const db = require('./db');
const { getHouseById } = require('./houseService');
const { validateString, validateOptionalString, validateYear, validateSex, validateId, validateBoolean } = require('./validators');

async function createPerson({ houseId, sex, praenomen, cognomen = null, isBastard = false, birthYear = null, deathYear = null, adoptiveHouseId = null }) {
  // Validate inputs
  houseId = validateId(houseId, 'House ID');
  sex = validateSex(sex);
  praenomen = validateString(praenomen, 100, 'Praenomen');
  cognomen = validateOptionalString(cognomen, 100, 'Cognomen');
  birthYear = validateYear(birthYear, 'Birth Year');
  deathYear = validateYear(deathYear, 'Death Year');
  if (adoptiveHouseId) adoptiveHouseId = validateId(adoptiveHouseId, 'Adoptive House ID');

  const house = await getHouseById(houseId);
  if (!house) throw new Error('House not found');

  const nomen = house.gens_name;

  const isBastardValue = isBastard ? 1 : 0;

  const [result] = await db.execute(
    `INSERT INTO person (praenomen, nomen, cognomen, house_id, adoptive_house_id, sex, is_bastard, birth_year, death_year)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [praenomen, nomen, cognomen, houseId, adoptiveHouseId || null, sex, isBastardValue, birthYear, deathYear]
  );

  return result.insertId;
}

async function getPersonById(id) {
  const [rows] = await db.execute(
    `SELECT * FROM person WHERE id = ?`,
    [id]
  );
  return rows[0] || null;
}

module.exports = { createPerson, getPersonById };