require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const db = require('./db');
const { createHouse, getHouseById } = require('./houseService');
const { createPerson, getPersonById } = require('./personService');
const { addParentChild } = require('./relationshipService');
const { genderifyNomen } = require('./romanNaming');
const { 
  findRelationshipByIds, 
  getStoredRelations, 
  computeAllRelationships 
} = require('./relationCheckerService');


const app = express();
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

async function getAllHouses() {
  const [rows] = await db.execute(`SELECT * FROM house ORDER BY gens_name`);
  return rows;
}

async function getAllPeople() {
  const [rows] = await db.execute(`SELECT * FROM person ORDER BY praenomen`);
  return rows;
}

async function getChildren(personId) {
  const [rows] = await db.execute(
    `SELECT p.*
     FROM parent_child pc
     JOIN person p ON pc.child_id = p.id
     WHERE pc.parent_id = ?
     ORDER BY (p.birth_year IS NULL), p.birth_year, p.praenomen`,
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

async function buildTree(person, prefix = '', isLast = true, seen = new Set(), depth = 0, treeHouseId = null) {
  const branch = prefix + (isLast ? '└── ' : '├── ');

  // Gendered nomen
  const nomen = genderifyNomen(person.nomen, person.sex);

  // Birth/death years
  const dateStr = formatRomanDate(person.birth_year, person.death_year);

  // CLICKABLE NAME
  const nameHtml = `<a href="/people/${person.id}">${formatDisplayName(person)}</a>`;

  // If treeHouseId is null, this is the root, so set it
  if (treeHouseId === null) {
    treeHouseId = person.house_id;
  }

  if (seen.has(person.id)) {
      const repeatHtml = `${branch}${nameHtml} ${dateStr} <a href="#person-${person.id}">[see above]</a>`;
    return `${repeatHtml}\n`;
  }

  seen.add(person.id);
  const anchoredNameHtml = `<span id="person-${person.id}">${nameHtml}</span>`;
    let output = `${branch}${anchoredNameHtml} ${dateStr}\n`;

  const children = await getChildren(person.id);
  const newPrefix = prefix + (isLast ? '    ' : '│   ');

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const last = i === children.length - 1;
    
    // If child is in a different house, show them but check their children
    if (child.house_id !== treeHouseId) {
      const childNomen = genderifyNomen(child.nomen, child.sex);
      const childDateStr = formatRomanDate(child.birth_year, child.death_year);
      const childNameHtml = `<a href="/people/${child.id}">${formatDisplayName(child)}</a>`;
      const childBranch = newPrefix + (last ? '└── ' : '├── ');
      
      // Check if any grandchildren are in the original tree house
      const grandchildren = await getChildren(child.id);
      const grandchildrenInTreeHouse = grandchildren.filter(gc => gc.house_id === treeHouseId);
      const grandchildrenNotInTreeHouse = grandchildren.filter(gc => gc.house_id !== treeHouseId);
      
      // Only show "View [House] tree" link if there are children NOT in the tree house
      let houseLink = '';
      if (grandchildrenNotInTreeHouse.length > 0) {
        const [houseRows] = await db.execute('SELECT * FROM house WHERE id = ?', [child.house_id]);
        const childHouse = houseRows[0];
        houseLink = childHouse ? ` → <a href="/tree/${childHouse.id}">View ${childHouse.gens_name} tree</a>` : '';
      }
      
      output += `${childBranch}${childNameHtml} ${childDateStr}${houseLink}\n`;
      
      if (grandchildrenInTreeHouse.length > 0) {
        // Show grandchildren who are back in the original house
        const grandchildPrefix = newPrefix + (last ? '    ' : '│   ');
        for (let j = 0; j < grandchildrenInTreeHouse.length; j++) {
          const grandchild = grandchildrenInTreeHouse[j];
          const gcLast = j === grandchildrenInTreeHouse.length - 1;
          output += await buildTree(grandchild, grandchildPrefix, gcLast, seen, depth + 2, treeHouseId);
        }
      }
    } else {
      // Child is in the same house, recurse normally
      output += await buildTree(child, newPrefix, last, seen, depth + 1, treeHouseId);
    }
  }

  return output;
}

app.get('/', async (req, res) => {
  const houses = await getAllHouses();
  res.render('index', { houses });
});

app.get('/houses', async (req, res) => {
  const houses = await getAllHouses();
  res.render('houses', { houses });
});

app.get('/houses/add', (req, res) => {
  res.render('add-house');
});

app.post('/houses/add', async (req, res) => {
  await createHouse(req.body.gens_name);
  res.redirect('/houses');
});

app.get('/houses/edit/:id', async (req, res) => {
  const house = await getHouseById(req.params.id);
  const people = await getAllPeople();

  if (!house) return res.send("House not found");

  res.render('edit-house', { house, people, genderifyNomen });
});

app.post('/houses/edit/:id', async (req, res) => {
  const founderId = req.body.founder_id || null;

  await db.execute(
    `UPDATE house SET founder_id = ? WHERE id = ?`,
    [founderId, req.params.id]
  );

  res.redirect('/houses');
});

app.post('/houses/create-founder/:id', async (req, res) => {
  const houseId = req.params.id;

  const newFounderId = await createPerson({
    houseId,
    sex: parseInt(req.body.sex),
    praenomen: req.body.praenomen,
    cognomen: req.body.cognomen || null,
    birthYear: req.body.birth_year || null,
    deathYear: req.body.death_year || null
  });

  await db.execute(
    `UPDATE house SET founder_id = ? WHERE id = ?`,
    [newFounderId, houseId]
  );

  res.redirect('/houses');
});

app.get('/people', async (req, res) => {
  let people = await getAllPeople();
  const houses = await getAllHouses();

  // Sort by house name, then praenomen
  people.sort((a, b) => {
    const houseA = houses.find(h => h.id === a.house_id).gens_name;
    const houseB = houses.find(h => h.id === b.house_id).gens_name;
    if (houseA < houseB) return -1;
    if (houseA > houseB) return 1;
    return a.praenomen.localeCompare(b.praenomen);
  });

  res.render('people', { people, houses, genderifyNomen });
});

app.get('/people/add', async (req, res) => {
  const houses = await getAllHouses();
  const people = await getAllPeople();   // <-- REQUIRED
  res.render('add-person', { houses, people, genderifyNomen });
});

app.post('/people/add', async (req, res) => {
  const personId = await createPerson({
    houseId: parseInt(req.body.house_id),
    sex: parseInt(req.body.sex),
    praenomen: req.body.praenomen,
    cognomen: req.body.cognomen || null,
    isBastard: req.body.is_bastard === 'on',
    birthYear: req.body.birth_year || null,
    deathYear: req.body.death_year || null
  });

  // Add parents if selected
  if (req.body.father_id) {
    await addParentChild(req.body.father_id, personId, 'biological');
  }
  if (req.body.mother_id) {
    await addParentChild(req.body.mother_id, personId, 'biological');
  }

  res.redirect('/people');
});

app.get('/people/:id', async (req, res) => {
  const person = await getPersonById(req.params.id);
  if (!person) return res.send("Person not found");

  const houses = await getAllHouses();
  const house = houses.find(h => h.id === person.house_id);

  // Gendered nomen
  const nomen = person.is_bastard ? '' : genderifyNomen(person.nomen, person.sex);

  // Parents
  const [parents] = await db.execute(
    `SELECT p.*
     FROM parent_child pc
     JOIN person p ON pc.parent_id = p.id
     WHERE pc.child_id = ?`,
    [person.id]
  );

  // Children
  const [children] = await db.execute(
    `SELECT p.*
     FROM parent_child pc
     JOIN person p ON pc.child_id = p.id
     WHERE pc.parent_id = ?`,
    [person.id]
  );

  // Siblings = people who share at least one parent
  const [siblings] = await db.execute(
    `SELECT DISTINCT s.*
     FROM parent_child pc1
     JOIN parent_child pc2 ON pc1.parent_id = pc2.parent_id
     JOIN person s ON pc2.child_id = s.id
     WHERE pc1.child_id = ?
       AND s.id != ?`,
    [person.id, person.id]
  );

  res.render('person', {
    person,
    house,
    nomen,
    parents,
    children,
    siblings,
    genderifyNomen,
    formatRomanDate
  });
});

app.get('/tree/:houseId', async (req, res) => {
  const house = await getHouseById(req.params.houseId);

  if (!house.founder_id) {
    return res.send(`<h1>${house.gens_name}</h1><p>No founder set.</p>`);
  }

  const founder = await getPersonById(house.founder_id);
  const tree = await buildTree(founder, '', true, new Set(), 0);

  res.render('tree', { house, tree });
});

app.get('/people/edit/:id', async (req, res) => {
  const person = await getPersonById(req.params.id);
  if (!person) return res.send("Person not found");

  const houses = await getAllHouses();
  const people = await getAllPeople();

  // Get parents
  const [parents] = await db.execute(
    `SELECT p.*
     FROM parent_child pc
     JOIN person p ON pc.parent_id = p.id
     WHERE pc.child_id = ?`,
    [person.id]
  );

  const father = parents.find(p => p.sex === 1) || null;
  const mother = parents.find(p => p.sex === 0) || null;

  res.render('edit-person', {
    person,
    houses,
    people,
    father,
    mother,
    genderifyNomen
  });
});

app.post('/people/edit/:id', async (req, res) => {
  const personId = req.params.id;

  await db.execute(
    `UPDATE person
     SET house_id = ?, sex = ?, praenomen = ?, cognomen = ?, is_bastard = ?, birth_year = ?, death_year = ?
     WHERE id = ?`,
    [
      req.body.house_id,
      req.body.sex,
      req.body.praenomen,
      req.body.cognomen || null,
      req.body.is_bastard === 'on' ? 1 : 0,
      req.body.birth_year || null,
      req.body.death_year || null,
      personId
    ]
  );

  // Remove old parents
  await db.execute(`DELETE FROM parent_child WHERE child_id = ?`, [personId]);

  // Add new father
  if (req.body.father_id) {
    await addParentChild(req.body.father_id, personId, 'biological');
  }

  // Add new mother
  if (req.body.mother_id) {
    await addParentChild(req.body.mother_id, personId, 'biological');
  }

  res.redirect('/people/' + personId);
});

// ========== Relationship Checker Routes ==========

// View all relationships for a specific person
app.get('/people/:id/relationships', async (req, res) => {
  const personId = parseInt(req.params.id);
  const person = await getPersonById(personId);
  if (!person) return res.send('Person not found');

  const house = await getHouseById(person.house_id);
  const nomen = genderifyNomen(person.nomen, person.sex);
  
  // Get all stored relationships for this person
  const [relations] = await db.execute(
    `SELECT pr.*, 
            p1.praenomen as p1_praenomen, p1.nomen as p1_nomen, p1.cognomen as p1_cognomen, p1.sex as p1_sex, p1.is_bastard as p1_is_bastard,
            p2.praenomen as p2_praenomen, p2.nomen as p2_nomen, p2.cognomen as p2_cognomen, p2.sex as p2_sex, p2.is_bastard as p2_is_bastard,
            ancestor.praenomen as anc_praenomen, ancestor.nomen as anc_nomen, ancestor.cognomen as anc_cognomen, ancestor.sex as anc_sex, ancestor.is_bastard as anc_is_bastard
     FROM person_relation pr
     JOIN person p1 ON pr.person1_id = p1.id
     JOIN person p2 ON pr.person2_id = p2.id
     LEFT JOIN person ancestor ON pr.common_ancestor_id = ancestor.id
     WHERE pr.person1_id = ? OR pr.person2_id = ?
     ORDER BY pr.distance, pr.relation_type`,
    [personId, personId]
  );

  res.render('person-relationships', {
    person,
    house,
    nomen,
    relations,
    genderifyNomen
  });
});

// Relationship statistics
app.get('/relationships/stats', async (req, res) => {
  // Count relationships per person
  const [stats] = await db.execute(
    `SELECT 
       p.id,
       p.praenomen,
       p.nomen,
       p.cognomen,
       p.sex,
       p.is_bastard,
       COUNT(DISTINCT CASE WHEN pr.person1_id = p.id THEN pr.person2_id ELSE pr.person1_id END) as relation_count
     FROM person p
     LEFT JOIN person_relation pr ON (pr.person1_id = p.id OR pr.person2_id = p.id)
     GROUP BY p.id, p.praenomen, p.nomen, p.cognomen, p.sex, p.is_bastard
     ORDER BY relation_count DESC, p.praenomen`
  );

  // Total relationship count
  const [totalResult] = await db.execute(
    'SELECT COUNT(*) as total FROM person_relation'
  );
  const totalRelations = totalResult[0].total;

  res.render('relationship-stats', {
    stats,
    totalRelations,
    genderifyNomen
  });
});

// Check relationship between two people
app.get('/relationships/check', async (req, res) => {
  const people = await getAllPeople();
  const houses = await getAllHouses();

  res.render('check-relationship', { 
    people, 
    houses,
    genderifyNomen,
    result: null 
  });
});

app.post('/relationships/check', async (req, res) => {
  const { person1_id, person2_id } = req.body;

  try {
    const { closest, allRelations } = await findRelationshipByIds(
      parseInt(person1_id), 
      parseInt(person2_id)
    );

    const people = await getAllPeople();
    const houses = await getAllHouses();

    res.render('check-relationship', {
      people,
      houses,
      genderifyNomen,
      result: { closest, allRelations, person1_id, person2_id }
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error computing relationship');
  }
});

// Compute all relationships (may be slow for large databases)
app.post('/relationships/compute-all', async (req, res) => {
  try {
    const count = await computeAllRelationships();
    res.send(`Successfully computed ${count} relationship pairs.`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error computing relationships');
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on http://localhost:' + PORT));