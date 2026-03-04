const db = require('./db');
const { getPersonById } = require('./personService');
const { genderifyNomen } = require('./romanNaming'); // <-- IMPORTANT

async function getAllHouses() {
  const [rows] = await db.execute(`SELECT * FROM house ORDER BY gens_name`);
  return rows;
}

async function getChildren(personId) {
  const [rows] = await db.execute(
    `SELECT p.*
     FROM parent_child pc
     JOIN person p ON pc.child_id = p.id
     WHERE pc.parent_id = ?
     ORDER BY p.praenomen`,
    [personId]
  );
  return rows;
}

function formatRomanDate(birth, death) {
  let birthStr = '';
  let deathStr = '';

  if (birth !== null && birth !== undefined) {
    birthStr = birth < 0 ? `${Math.abs(birth)} BC` : `${birth} AD`;
  }

  if (death !== null && death !== undefined) {
    deathStr = death < 0 ? `${Math.abs(death)} BC` : `${death} AD`;
  }

  if (birthStr && deathStr) return `(${birthStr} – ${deathStr})`;
  if (birthStr) return `(${birthStr})`;
  if (deathStr) return `(d. ${deathStr})`;

  return '';
}

function formatDisplayName(person) {
  const nomen = genderifyNomen(person.nomen, person.sex);
  const nomenPart = person.is_bastard ? '' : ` ${nomen}`;
  const cognomenPart = person.cognomen ? ` ${person.cognomen}` : '';
  return `${person.praenomen}${nomenPart}${cognomenPart}`;
}

async function printPersonTree(person, prefix = '', isLast = true, treeHouseId = null) {
  const branch = prefix + (isLast ? '└── ' : '├── ');

  // FIX: date formatting
  const dateStr = formatRomanDate(person.birth_year, person.death_year);

  // If treeHouseId is null, this is the root, so set it
  if (treeHouseId === null) {
    treeHouseId = person.house_id;
  }

  console.log(
    branch +
    `${formatDisplayName(person)} ${dateStr}`
  );

  const children = await getChildren(person.id);
  const newPrefix = prefix + (isLast ? '    ' : '│   ');

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const last = i === children.length - 1;
    
    // If child is in a different house, show them but check their children
    if (child.house_id !== treeHouseId) {
      const childDateStr = formatRomanDate(child.birth_year, child.death_year);
      const childBranch = newPrefix + (last ? '└── ' : '├── ');
      
      // Check if any grandchildren are in the original tree house
      const grandchildren = await getChildren(child.id);
      const grandchildrenInTreeHouse = grandchildren.filter(gc => gc.house_id === treeHouseId);
      const grandchildrenNotInTreeHouse = grandchildren.filter(gc => gc.house_id !== treeHouseId);
      
      // Only show "See [House] tree" note if there are children NOT in the tree house
      let houseNote = '';
      if (grandchildrenNotInTreeHouse.length > 0) {
        const [houseRows] = await db.execute('SELECT * FROM house WHERE id = ?', [child.house_id]);
        const childHouse = houseRows[0];
        houseNote = childHouse ? ` → See ${childHouse.gens_name} tree` : '';
      }
      
      console.log(
        childBranch +
        `${formatDisplayName(child)} ${childDateStr}${houseNote}`
      );
      
      if (grandchildrenInTreeHouse.length > 0) {
        // Show grandchildren who are back in the original house
        const grandchildPrefix = newPrefix + (last ? '    ' : '│   ');
        for (let j = 0; j < grandchildrenInTreeHouse.length; j++) {
          const grandchild = grandchildrenInTreeHouse[j];
          const gcLast = j === grandchildrenInTreeHouse.length - 1;
          await printPersonTree(grandchild, grandchildPrefix, gcLast, treeHouseId);
        }
      }
    } else {
      // Child is in the same house, recurse normally
      await printPersonTree(child, newPrefix, last, treeHouseId);
    }
  }
}

async function printHouseTree(house) {
  console.log(`\n=== Gens ${house.gens_name} ===`);

  if (!house.founder_id) {
    console.log('(No founder set)');
    return;
  }

  const founder = await getPersonById(house.founder_id);
  if (!founder) {
    console.log('(Founder not found)');
    return;
  }

  await printPersonTree(founder, '', true);
}

async function main() {
  const houses = await getAllHouses();

  for (const house of houses) {
    await printHouseTree(house);
  }

  process.exit(0);
}

main().catch(console.error);