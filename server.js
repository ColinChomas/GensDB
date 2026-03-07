require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const fileUpload = require('express-fileupload');
const db = require('./db');
const { createHouse, getHouseById } = require('./houseService');
const { createPerson, getPersonById } = require('./personService');
const { addParentChild } = require('./relationshipService');
const { genderifyNomen } = require('./romanNaming');
const { 
  findRelationshipByIds, 
  computeAllRelationships,
  loadPeopleGraph,
  findPathsByIds
} = require('./relationCheckerService');


const app = express();
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(fileUpload());
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
    `SELECT p.*, pc.status as parent_status, pc.relationship_type
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

// Limited tree building for modal (grandparents to grandchildren only)
async function buildTreeLimited(person, prefix = '', isLast = true, seen = new Set(), depth = 0, treeHouseId = null, parentStatus = 'confirmed', maxDepth = 10, targetPersonId = null) {
  // Stop if we exceed max depth
  if (depth > maxDepth) {
    return '';
  }

  let branch;
  if (parentStatus === 'rumored') {
    branch = prefix + (isLast ? '└?─ ' : '├?─ ');
  } else {
    branch = prefix + (isLast ? '└── ' : '├── ');
  }

  const nomen = genderifyNomen(person.nomen, person.sex);
  const dateStr = formatRomanDate(person.birth_year, person.death_year);

  const nameHtml = `<a href="/people/${person.id}">${formatDisplayName(person)}</a>`;
  
  // Bold the target person
  let displayName = nameHtml;
  if (person.id === targetPersonId) {
    displayName = `<b>${nameHtml}</b>`;
  }

  if (treeHouseId === null) {
    treeHouseId = person.house_id;
  }

  if (seen.has(person.id)) {
    const repeatHtml = `${branch}${displayName} ${dateStr} <a href="#person-${person.id}">[see above]</a>`;
    return `${repeatHtml}\n`;
  }

  seen.add(person.id);
  const anchoredNameHtml = `<span id="person-${person.id}">${displayName}</span>`;
  let output = `${branch}${anchoredNameHtml} ${dateStr}\n`;

  const children = await getChildren(person.id);
  const newPrefix = prefix + (isLast ? '    ' : '│   ');

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const last = i === children.length - 1;
    
    if (child.house_id !== treeHouseId) {
      const childNomen = genderifyNomen(child.nomen, child.sex);
      const childDateStr = formatRomanDate(child.birth_year, child.death_year);
      const childNameHtml = `<a href="/people/${child.id}">${formatDisplayName(child)}</a>`;
      
      let childBranch;
      if (child.parent_status === 'rumored') {
        childBranch = newPrefix + (last ? '└?─ ' : '├?─ ');
      } else {
        childBranch = newPrefix + (last ? '└── ' : '├── ');
      }
      
      const grandchildren = await getChildren(child.id);
      const grandchildrenInTreeHouse = grandchildren.filter(gc => gc.house_id === treeHouseId);
      const grandchildrenNotInTreeHouse = grandchildren.filter(gc => gc.house_id !== treeHouseId);
      
      let houseLink = '';
      if (grandchildrenNotInTreeHouse.length > 0) {
        const [houseRows] = await db.execute('SELECT * FROM house WHERE id = ?', [child.house_id]);
        const childHouse = houseRows[0];
        houseLink = childHouse ? ` → <a href="/tree/${childHouse.id}">View ${childHouse.gens_name} tree</a>` : '';
      }
      
      output += `${childBranch}${childNameHtml} ${childDateStr}${houseLink}\n`;
      
      if (grandchildrenInTreeHouse.length > 0 && depth + 1 <= maxDepth) {
        const grandchildPrefix = newPrefix + (last ? '    ' : '│   ');
        for (let j = 0; j < grandchildrenInTreeHouse.length; j++) {
          const grandchild = grandchildrenInTreeHouse[j];
          const gcLast = j === grandchildrenInTreeHouse.length - 1;
          output += await buildTreeLimited(grandchild, grandchildPrefix, gcLast, seen, depth + 2, treeHouseId, grandchild.parent_status, maxDepth, targetPersonId);
        }
      }
    } else {
      output += await buildTreeLimited(child, newPrefix, last, seen, depth + 1, treeHouseId, child.parent_status, maxDepth, targetPersonId);
    }
  }

  return output;
}

// Get all ancestors of a person (up to 3 generations)
async function getAncestors(personId, maxGenerations = 3, generations = 0) {
  if (generations >= maxGenerations) {
    return new Set();
  }

  const [parents] = await db.execute(
    `SELECT DISTINCT p.id FROM parent_child pc 
     JOIN person p ON pc.parent_id = p.id 
     WHERE pc.child_id = ?`,
    [personId]
  );

  let ancestors = new Set();
  for (const parent of parents) {
    ancestors.add(parent.id);
    const grandparents = await getAncestors(parent.id, maxGenerations, generations + 1);
    grandparents.forEach(gp => ancestors.add(gp));
  }

  return ancestors;
}

// Calculate ancestral genetic variation (how inbred their ancestors are)
async function calculateAncestralInbreeding(personId) {
  try {
    // Get all ancestors up to 5 generations back
    const [allAncestors] = await db.execute(
      `WITH RECURSIVE ancestor_tree AS (
        SELECT parent_id as ancestor_id, 1 as generation
        FROM parent_child
        WHERE child_id = ?
        UNION ALL
        SELECT pc.parent_id, at.generation + 1
        FROM parent_child pc
        JOIN ancestor_tree at ON pc.child_id = at.ancestor_id
        WHERE at.generation < 5
      )
      SELECT DISTINCT ancestor_id FROM ancestor_tree`,
      [personId]
    );

    if (allAncestors.length === 0) {
      return { coefficient: 0, percentage: '0%', description: 'No ancestor data available' };
    }

    // Calculate inbreeding coefficient for each ancestor
    let totalCoefficient = 0;
    let ancestorsWithData = 0;

    for (const ancestorRecord of allAncestors) {
      const ancestorInbreeding = await calculateInbreedingCoefficient(ancestorRecord.ancestor_id);
      if (ancestorInbreeding.coefficient > 0) {
        totalCoefficient += ancestorInbreeding.coefficient;
        ancestorsWithData++;
      }
    }

    // Average inbreeding coefficient across all ancestors
    const averageCoefficient = ancestorsWithData > 0 ? totalCoefficient / ancestorsWithData : 0;
    const percentage = (averageCoefficient * 100).toFixed(2);
    
    let description = 'Pure ancestry';
    
    if (averageCoefficient > 0.125) {
      description = 'Highly inbred ancestry';
    } else if (averageCoefficient > 0.0625) {
      description = 'Moderately inbred ancestry';
    } else if (averageCoefficient > 0.015625) {
      description = 'Mildly inbred ancestry';
    } else if (averageCoefficient > 0) {
      description = 'Some inbreeding in ancestry';
    }

    return { coefficient: averageCoefficient, percentage, description, ancestorsAnalyzed: allAncestors.length };
  } catch (error) {
    console.error('Error calculating ancestral inbreeding:', error);
    return { coefficient: 0, percentage: '0%', description: 'Error calculating' };
  }
}

// Calculate inbreeding coefficient based on common ancestors
async function calculateInbreedingCoefficient(personId) {
  try {
    // Get both parents
    const [parents] = await db.execute(
      `SELECT DISTINCT p.*, pc.status FROM parent_child pc 
       JOIN person p ON pc.parent_id = p.id 
       WHERE pc.child_id = ?`,
      [personId]
    );

    if (parents.length < 2) {
      return { coefficient: 0, percentage: '0%', description: 'No inbreeding detected' };
    }

    // Get father and mother
    const father = parents.find(p => p.sex === 1);
    const mother = parents.find(p => p.sex === 0);

    if (!father || !mother) {
      return { coefficient: 0, percentage: '0%', description: 'Insufficient parent data' };
    }

    // Get all ancestors for each parent
    const fatherAncestors = await getAncestors(father.id, 3);
    const motherAncestors = await getAncestors(mother.id, 3);

    // Find common ancestors
    const commonAncestors = new Set([...fatherAncestors].filter(x => motherAncestors.has(x)));

    if (commonAncestors.size === 0) {
      return { coefficient: 0, percentage: '0%', description: 'Unrelated parents' };
    }

    // Simple coefficient: count of common ancestors as percentage
    // Each common ancestor increases coefficient
    // This is a simplified measure
    let coefficient = 0;
    for (const ancestorId of commonAncestors) {
      // Get distance from father to ancestor
      const fatherDist = await getDistance(father.id, ancestorId);
      // Get distance from mother to ancestor
      const motherDist = await getDistance(mother.id, ancestorId);

      if (fatherDist !== null && motherDist !== null) {
        // Contribution = (1/2)^(d1 + d2 + 1)
        coefficient += Math.pow(0.5, fatherDist + motherDist + 1);
      }
    }

    const percentage = (coefficient * 100).toFixed(2);
    let description = 'Unrelated';
    
    if (coefficient > 0.125) {
      description = 'Highly inbred';
    } else if (coefficient > 0.0625) {
      description = 'Moderately inbred';
    } else if (coefficient > 0.015625) {
      description = 'Mildly inbred';
    } else if (coefficient > 0) {
      description = 'Distantly related';
    }

    return { coefficient, percentage, description, commonAncestors: commonAncestors.size };
  } catch (error) {
    console.error('Error calculating inbreeding:', error);
    return { coefficient: 0, percentage: '0%', description: 'Error calculating' };
  }
}

// Calculate distance between two people in the family tree
async function getDistance(personId, ancestorId, visited = new Set(), distance = 0) {
  if (personId === ancestorId) {
    return distance;
  }

  if (visited.has(personId) || distance > 5) {
    return null;
  }

  visited.add(personId);

  const [parents] = await db.execute(
    `SELECT p.id FROM parent_child pc 
     JOIN person p ON pc.parent_id = p.id 
     WHERE pc.child_id = ?`,
    [personId]
  );

  for (const parent of parents) {
    const result = await getDistance(parent.id, ancestorId, visited, distance + 1);
    if (result !== null) {
      return result;
    }
  }

  return null;
}

async function buildTree(person, prefix = '', isLast = true, seen = new Set(), depth = 0, treeHouseId = null, parentStatus = 'confirmed') {
  // For rumored parent relationships, use ├?─ or └?─ instead of normal branch characters
  let branch;
  if (parentStatus === 'rumored') {
    branch = prefix + (isLast ? '└?─ ' : '├?─ ');
  } else {
    branch = prefix + (isLast ? '└── ' : '├── ');
  }

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
      
      // Determine branch for child based on parent status
      let childBranch;
      if (child.parent_status === 'rumored') {
        childBranch = newPrefix + (last ? '└?─ ' : '├?─ ');
      } else {
        childBranch = newPrefix + (last ? '└── ' : '├── ');
      }
      
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
          output += await buildTree(grandchild, grandchildPrefix, gcLast, seen, depth + 2, treeHouseId, grandchild.parent_status);
        }
      }
    } else {
      // Child is in the same house, recurse normally
      output += await buildTree(child, newPrefix, last, seen, depth + 1, treeHouseId, child.parent_status);
    }
  }

  return output;
}

app.get('/', async (req, res) => {
  const houses = await getAllHouses();
  const people = await getAllPeople();
  
  // Count members per house and get founder details
  const housesWithDetails = await Promise.all(houses.map(async (house) => {
    const memberCount = people.filter(p => p.house_id === house.id).length;
    let founder = null;
    if (house.founder_id) {
      founder = await getPersonById(house.founder_id);
    }
    return { ...house, founder, memberCount };
  }));
  
  res.render('index', { houses: housesWithDetails, genderifyNomen });
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

// Export house members as CSV
app.get('/houses/:id/export-csv', async (req, res) => {
  try {
    const houseId = req.params.id;
    const house = await getHouseById(houseId);
    
    if (!house) {
      return res.status(404).send('House not found');
    }

    // Get all people in this house
    const [people] = await db.execute(
      `SELECT * FROM person WHERE house_id = ? ORDER BY praenomen`,
      [houseId]
    );

    // Get parent-child relationships for people in this house
    const [relationships] = await db.execute(
      `SELECT pc.parent_id, pc.child_id, p1.praenomen as parent_praenomen, p1.nomen as parent_nomen, p2.praenomen as child_praenomen, p2.nomen as child_nomen
       FROM parent_child pc
       JOIN person p1 ON pc.parent_id = p1.id
       JOIN person p2 ON pc.child_id = p2.id
       WHERE (p1.house_id = ? OR p2.house_id = ?)`,
      [houseId, houseId]
    );

    // Build CSV content with parent references
    let csv = 'praenomen,nomen,cognomen,sex,is_bastard,birth_year,death_year,father_praenomen,father_nomen,mother_praenomen,mother_nomen\n';
    
    for (const person of people) {
      // Find parents for this person
      const personRelationships = relationships.filter(r => 
        r.child_praenomen === person.praenomen && r.child_nomen === person.nomen
      );
      
      let father = null;
      let mother = null;
      
      for (const rel of personRelationships) {
        // Get parent gender to determine if father or mother
        const [parentData] = await db.execute(
          `SELECT sex FROM person WHERE praenomen = ? AND nomen = ?`,
          [rel.parent_praenomen, rel.parent_nomen]
        );
        
        if (parentData.length > 0) {
          if (parentData[0].sex === 1) {
            father = { praenomen: rel.parent_praenomen, nomen: rel.parent_nomen };
          } else {
            mother = { praenomen: rel.parent_praenomen, nomen: rel.parent_nomen };
          }
        }
      }
      
      const praenomen = escapeCSV(person.praenomen);
      const nomen = escapeCSV(person.nomen);
      const cognomen = escapeCSV(person.cognomen || '');
      const sex = person.sex;
      const isBastard = person.is_bastard;
      const birthYear = person.birth_year || '';
      const deathYear = person.death_year || '';
      const fatherPraenomen = father ? escapeCSV(father.praenomen) : '';
      const fatherNomen = father ? escapeCSV(father.nomen) : '';
      const motherPraenomen = mother ? escapeCSV(mother.praenomen) : '';
      const motherNomen = mother ? escapeCSV(mother.nomen) : '';
      
      csv += `${praenomen},${nomen},${cognomen},${sex},${isBastard},${birthYear},${deathYear},${fatherPraenomen},${fatherNomen},${motherPraenomen},${motherNomen}\n`;
    }

    // Send as download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${house.gens_name}_export.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).send('Error exporting CSV');
  }
});

// Import house members from CSV
app.post('/houses/:id/import-csv', async (req, res) => {
  try {
    const houseId = parseInt(req.params.id);
    const house = await getHouseById(houseId);
    
    if (!house) {
      return res.status(404).send('House not found');
    }

    // Check if file was uploaded
    if (!req.files || !req.files['csv-file']) {
      const people = await getAllPeople();
      return res.render('edit-house', {
        house,
        people,
        message: { type: 'error', text: 'No file uploaded' },
        genderifyNomen
      });
    }

    const file = req.files['csv-file'];
    const csvData = file.data.toString('utf-8');
    const lines = csvData.split('\n').map(line => line.trim()).filter(line => line);

    if (lines.length < 2) {
      const people = await getAllPeople();
      return res.render('edit-house', {
        house,
        people,
        message: { type: 'error', text: 'CSV file must have a header and at least one data row' },
        genderifyNomen
      });
    }

    // Parse header
    const headers = lines[0].split(',').map(h => h.trim());
    const requiredHeaders = ['praenomen', 'nomen', 'sex'];
    
    const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
    if (missingHeaders.length > 0) {
      const people = await getAllPeople();
      return res.render('edit-house', {
        house,
        people,
        message: { 
          type: 'error', 
          text: 'Invalid CSV format',
          details: `Missing required columns: ${missingHeaders.join(', ')}`
        },
        genderifyNomen
      });
    }

    // Create header index map
    const headerIndices = {};
    headers.forEach((header, i) => {
      headerIndices[header] = i;
    });

    let importedCount = 0;
    let errors = [];
    const importedPeopleMap = new Map(); // Track imported people for relationships

    // Process each data row
    for (let i = 1; i < lines.length; i++) {
      try {
        const line = lines[i];
        if (!line.trim()) continue;

        const values = parseCSVLine(line);

        // Extract values
        const praenomen = values[headerIndices['praenomen']]?.trim();
        const nomen = values[headerIndices['nomen']]?.trim();
        const cognomen = values[headerIndices['cognomen']]?.trim() || null;
        const sex = parseInt(values[headerIndices['sex']]) || 0;
        const isBastard = parseInt(values[headerIndices['is_bastard']]) || 0;
        const birthYear = values[headerIndices['birth_year']]?.trim() ? parseInt(values[headerIndices['birth_year']]) : null;
        const deathYear = values[headerIndices['death_year']]?.trim() ? parseInt(values[headerIndices['death_year']]) : null;
        const fatherPraenomen = values[headerIndices['father_praenomen']]?.trim() || null;
        const fatherNomen = values[headerIndices['father_nomen']]?.trim() || null;
        const motherPraenomen = values[headerIndices['mother_praenomen']]?.trim() || null;
        const motherNomen = values[headerIndices['mother_nomen']]?.trim() || null;

        // Validate required fields
        if (!praenomen || !nomen) {
          errors.push(`Row ${i + 1}: Missing praenomen or nomen`);
          continue;
        }

        // Insert person
        const [insertResult] = await db.execute(
          `INSERT INTO person (praenomen, nomen, cognomen, house_id, sex, is_bastard, birth_year, death_year)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [praenomen, nomen, cognomen, houseId, sex, isBastard, birthYear, deathYear]
        );

        const newPersonId = insertResult.insertId;
        importedPeopleMap.set(`${praenomen}|${nomen}`, newPersonId);

        // Handle parent relationships
        if (fatherPraenomen && fatherNomen) {
          // Find father by praenomen and nomen (search all houses)
          const [fatherData] = await db.execute(
            `SELECT id FROM person WHERE praenomen = ? AND nomen = ?`,
            [fatherPraenomen, fatherNomen]
          );
          
          if (fatherData.length > 0) {
            await addParentChild(fatherData[0].id, newPersonId, 'biological', 'confirmed');
          } else {
            errors.push(`Row ${i + 1}: Father not found (${fatherPraenomen} ${fatherNomen})`);
          }
        }

        if (motherPraenomen && motherNomen) {
          // Find mother by praenomen and nomen (search all houses)
          const [motherData] = await db.execute(
            `SELECT id FROM person WHERE praenomen = ? AND nomen = ?`,
            [motherPraenomen, motherNomen]
          );
          
          if (motherData.length > 0) {
            await addParentChild(motherData[0].id, newPersonId, 'biological', 'confirmed');
          } else {
            errors.push(`Row ${i + 1}: Mother not found (${motherPraenomen} ${motherNomen})`);
          }
        }

        importedCount++;
      } catch (rowError) {
        errors.push(`Row ${i + 1}: ${rowError.message}`);
      }
    }

    // Reload people for the form
    const people = await getAllPeople();
    
    let details = `Imported ${importedCount} member${importedCount !== 1 ? 's' : ''}`;
    if (errors.length > 0) {
      details += `. ${errors.length} error${errors.length !== 1 ? 's' : ''}: ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? '...' : ''}`;
    }

    res.render('edit-house', {
      house,
      people,
      message: { 
        type: importedCount > 0 ? 'success' : 'error',
        text: importedCount > 0 ? 'Import completed!' : 'No members imported',
        details: details
      },
      genderifyNomen
    });
  } catch (error) {
    console.error('CSV import error:', error);
    const people = await getAllPeople();
    res.render('edit-house', {
      house: await getHouseById(req.params.id),
      people,
      message: { type: 'error', text: 'Import failed', details: error.message },
      genderifyNomen
    });
  }
});

// Helper function to escape values for CSV
function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Helper function to parse CSV line (handles quoted fields)
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

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
    deathYear: req.body.death_year || null,
    adoptiveHouseId: req.body.adoptive_house_id ? parseInt(req.body.adoptive_house_id) : null
  });

  // Add biological father (always confirmed)
  if (req.body.father_id) {
    await addParentChild(req.body.father_id, personId, 'biological', 'confirmed');
  }
  // Add biological mother (always confirmed)
  if (req.body.mother_id) {
    await addParentChild(req.body.mother_id, personId, 'biological', 'confirmed');
  }
  // Add rumored biological parents
  if (req.body.rumored_parent_ids) {
    const rumoredIds = Array.isArray(req.body.rumored_parent_ids) 
      ? req.body.rumored_parent_ids 
      : [req.body.rumored_parent_ids];
    for (const parentId of rumoredIds) {
      if (parentId) {
        await addParentChild(parentId, personId, 'biological', 'rumored');
      }
    }
  }

  // Add adoptive parents if selected
  if (req.body.adoptive_father_id) {
    const adoptiveFatherStatus = req.body.adoptive_father_status || 'confirmed';
    await addParentChild(req.body.adoptive_father_id, personId, 'adoptive', adoptiveFatherStatus);
  }
  if (req.body.adoptive_mother_id) {
    const adoptiveMotherStatus = req.body.adoptive_mother_status || 'confirmed';
    await addParentChild(req.body.adoptive_mother_id, personId, 'adoptive', adoptiveMotherStatus);
  }

  res.redirect('/people');
});

app.get('/people/:id', async (req, res) => {
  const person = await getPersonById(req.params.id);
  if (!person) return res.send("Person not found");

  const houses = await getAllHouses();
  const house = houses.find(h => h.id === person.house_id);
  const adoptiveHouse = person.adoptive_house_id ? houses.find(h => h.id === person.adoptive_house_id) : null;

  // Use adoptive house nomen if they're adopted, otherwise use birth house nomen
  const displayHouse = adoptiveHouse || house;
  const nomen = person.is_bastard ? '' : genderifyNomen(displayHouse.gens_name, person.sex);

  // Biological parents with status
  const [bioParentsData] = await db.execute(
    `SELECT p.*, pc.status
     FROM parent_child pc
     JOIN person p ON pc.parent_id = p.id
     WHERE pc.child_id = ? AND pc.relationship_type = 'biological'`,
    [person.id]
  );

  // Separate confirmed and rumored biological parents
  const confirmedParents = bioParentsData.filter(p => p.status === 'confirmed');
  const rumoredParents = bioParentsData.filter(p => p.status === 'rumored');

  // Adoptive parents with status
  const [adoptiveParentsData] = await db.execute(
    `SELECT p.*, pc.status
     FROM parent_child pc
     JOIN person p ON pc.parent_id = p.id
     WHERE pc.child_id = ? AND pc.relationship_type = 'adoptive'`,
    [person.id]
  );

  // Separate confirmed and rumored adoptive parents
  const confirmedAdoptiveParents = adoptiveParentsData.filter(p => p.status === 'confirmed');
  const rumoredAdoptiveParents = adoptiveParentsData.filter(p => p.status === 'rumored');

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

  // Partners = people with explicit partnership relationships
  const [partnersData] = await db.execute(
    `SELECT DISTINCT p.*
     FROM partnership pt
     JOIN person p ON (pt.person2_id = p.id AND pt.person1_id = ?)
        OR (pt.person1_id = p.id AND pt.person2_id = ?)
     WHERE pt.status = 'confirmed'`,
    [person.id, person.id]
  );

  // Rumored partners
  const [rumoredPartnersData] = await db.execute(
    `SELECT DISTINCT p.*
     FROM partnership pt
     JOIN person p ON (pt.person2_id = p.id AND pt.person1_id = ?)
        OR (pt.person1_id = p.id AND pt.person2_id = ?)
     WHERE pt.status = 'rumored'`,
    [person.id, person.id]
  );

  // Grandparents (parents of the person's parents)
  const [grandparents] = await db.execute(
    `SELECT DISTINCT gp.*
     FROM parent_child pc1
     JOIN parent_child pc2 ON pc1.parent_id = pc2.child_id
     JOIN person gp ON pc2.parent_id = gp.id
     WHERE pc1.child_id = ?`,
    [person.id]
  );

  // Grandchildren (children of the person's children)
  const [grandchildren] = await db.execute(
    `SELECT DISTINCT gc.*
     FROM parent_child pc1
     JOIN parent_child pc2 ON pc1.child_id = pc2.parent_id
     JOIN person gc ON pc2.child_id = gc.id
     WHERE pc1.parent_id = ?`,
    [person.id]
  );

  // Calculate inbreeding coefficient
  const inbreedingData = await calculateInbreedingCoefficient(person.id);

  // Calculate ancestral genetic variation
  const ancestralInbreedingData = await calculateAncestralInbreeding(person.id);

  res.render('person', {
    person,
    house,
    adoptiveHouse,
    nomen,
    confirmedParents,
    rumoredParents,
    confirmedAdoptiveParents,
    rumoredAdoptiveParents,
    children,
    siblings,
    partners: partnersData,
    rumoredPartners: rumoredPartnersData,
    grandparents,
    grandchildren,
    inbreedingData,
    ancestralInbreedingData,
    genderifyNomen,
    formatRomanDate
  });
});

// Build a limited family tree for a person (grandparents through grandchildren)
app.get('/people/:id/family-tree-limited', async (req, res) => {
  const person = await getPersonById(req.params.id);
  if (!person) return res.send("Person not found");

  let root = person;
  let maxDepth = 4; // Show up to depth 4 (grandparents to grandchildren)
  
  // Try to find the highest ancestor (grandparent)
  const [parents] = await db.execute(
    `SELECT p.*, pc.status as parent_status FROM parent_child pc 
     JOIN person p ON pc.parent_id = p.id 
     WHERE pc.child_id = ? LIMIT 1`,
    [person.id]
  );
  
  if (parents.length > 0) {
    root = parents[0];
    
    const [grandparents] = await db.execute(
      `SELECT p.*, pc.status as parent_status FROM parent_child pc 
       JOIN person p ON pc.parent_id = p.id 
       WHERE pc.child_id = ? LIMIT 1`,
      [root.id]
    );
    
    if (grandparents.length > 0) {
      root = grandparents[0];
    }
  }

  // Build the tree with depth limit and person highlighting
  const tree = await buildTreeLimited(root, '', true, new Set(), 0, null, 'confirmed', maxDepth, person.id);
  
  let treeHtml = '<div class="tree" style="white-space: pre; font-family: monospace; font-size: 13px;">';
  treeHtml += tree;
  treeHtml += '</div>';
  
  res.send(treeHtml);
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

  // Get confirmed biological parents
  const [bioParentsData] = await db.execute(
    `SELECT p.*, pc.status, pc.relationship_type
     FROM parent_child pc
     JOIN person p ON pc.parent_id = p.id
     WHERE pc.child_id = ? AND pc.relationship_type = 'biological' AND pc.status = 'confirmed'`,
    [person.id]
  );

  const father = bioParentsData.find(p => p.sex === 1) || null;
  const mother = bioParentsData.find(p => p.sex === 0) || null;

  // Get all biological parents (confirmed and rumored)
  const [allBioParentsData] = await db.execute(
    `SELECT p.*, pc.status, pc.relationship_type
     FROM parent_child pc
     JOIN person p ON pc.parent_id = p.id
     WHERE pc.child_id = ? AND pc.relationship_type = 'biological'`,
    [person.id]
  );

  // Get confirmed adoptive parents
  const [adoptiveParentsData] = await db.execute(
    `SELECT p.*, pc.status, pc.relationship_type
     FROM parent_child pc
     JOIN person p ON pc.parent_id = p.id
     WHERE pc.child_id = ? AND pc.relationship_type = 'adoptive' AND pc.status = 'confirmed'`,
    [person.id]
  );

  const adoptiveFather = adoptiveParentsData.find(p => p.sex === 1) || null;
  const adoptiveMother = adoptiveParentsData.find(p => p.sex === 0) || null;

  // Get all adoptive parents (confirmed and rumored)
  const [allAdoptiveParentsData] = await db.execute(
    `SELECT p.*, pc.status, pc.relationship_type
     FROM parent_child pc
     JOIN person p ON pc.parent_id = p.id
     WHERE pc.child_id = ? AND pc.relationship_type = 'adoptive'`,
    [person.id]
  );

  // Get partners
  const [partnersData] = await db.execute(
    `SELECT DISTINCT p.*, pt.status
     FROM partnership pt
     JOIN person p ON (pt.person2_id = p.id AND pt.person1_id = ?)
        OR (pt.person1_id = p.id AND pt.person2_id = ?)`,
    [person.id, person.id]
  );

  const confirmedPartners = partnersData.filter(p => p.status === 'confirmed');
  const rumoredPartners = partnersData.filter(p => p.status === 'rumored');

  res.render('edit-person', {
    person,
    houses,
    people,
    father,
    mother,
    adoptiveFather,
    adoptiveMother,
    confirmedPartners,
    rumoredPartners,
    allParents: allBioParentsData,
    genderifyNomen
  });
});

app.post('/people/edit/:id', async (req, res) => {
  const personId = req.params.id;

  await db.execute(
    `UPDATE person
     SET house_id = ?, adoptive_house_id = ?, sex = ?, praenomen = ?, cognomen = ?, is_bastard = ?, birth_year = ?, death_year = ?
     WHERE id = ?`,
    [
      req.body.house_id,
      req.body.adoptive_house_id ? parseInt(req.body.adoptive_house_id) : null,
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

  // Add biological father (always confirmed)
  if (req.body.father_id) {
    await addParentChild(req.body.father_id, personId, 'biological', 'confirmed');
  }

  // Add biological mother (always confirmed)
  if (req.body.mother_id) {
    await addParentChild(req.body.mother_id, personId, 'biological', 'confirmed');
  }

  // Add rumored biological parents
  if (req.body.rumored_parent_ids) {
    const rumoredIds = Array.isArray(req.body.rumored_parent_ids) 
      ? req.body.rumored_parent_ids 
      : [req.body.rumored_parent_ids];
    for (const parentId of rumoredIds) {
      if (parentId) {
        await addParentChild(parentId, personId, 'biological', 'rumored');
      }
    }
  }

  // Add adoptive father if selected
  if (req.body.adoptive_father_id) {
    const adoptiveFatherStatus = req.body.adoptive_father_status || 'confirmed';
    await addParentChild(req.body.adoptive_father_id, personId, 'adoptive', adoptiveFatherStatus);
  }

  // Add adoptive mother if selected
  if (req.body.adoptive_mother_id) {
    const adoptiveMotherStatus = req.body.adoptive_mother_status || 'confirmed';
    await addParentChild(req.body.adoptive_mother_id, personId, 'adoptive', adoptiveMotherStatus);
  }

  res.redirect('/people/' + personId);
});

// ========== Partnership Routes ==========

// Add a partnership between two people
app.post('/partnership/add', async (req, res) => {
  const { person1_id, person2_id, status } = req.body;
  
  if (!person1_id || !person2_id) {
    return res.status(400).json({ error: 'Both person IDs are required' });
  }

  if (person1_id === person2_id) {
    return res.status(400).json({ error: 'Cannot create partnership with the same person' });
  }

  const partnershipStatus = status === 'rumored' ? 'rumored' : 'confirmed';

  try {
    await db.execute(
      `INSERT INTO partnership (person1_id, person2_id, status) VALUES (?, ?, ?)`,
      [person1_id, person2_id, partnershipStatus]
    );
    return res.json({ success: true });
  } catch (error) {
    console.error('Error adding partnership:', error);
    return res.status(500).json({ error: 'Failed to add partnership' });
  }
});

// Remove a partnership between two people
app.post('/partnership/remove/:person1Id/:person2Id', async (req, res) => {
  const person1Id = parseInt(req.params.person1Id);
  const person2Id = parseInt(req.params.person2Id);

  try {
    // Remove partnership in either direction
    await db.execute(
      `DELETE FROM partnership 
       WHERE (person1_id = ? AND person2_id = ?) OR (person1_id = ? AND person2_id = ?)`,
      [person1Id, person2Id, person2Id, person1Id]
    );
    return res.json({ success: true });
  } catch (error) {
    console.error('Error removing partnership:', error);
    return res.status(500).json({ error: 'Failed to remove partnership' });
  }
});

// ========== Relationship Checker Routes ==========

// View all relationships for a specific person
app.get('/people/:id/relationships', async (req, res) => {
  const personId = parseInt(req.params.id);
  const person = await getPersonById(personId);
  if (!person) return res.send('Person not found');

  const house = await getHouseById(person.house_id);
  const nomen = genderifyNomen(person.nomen, person.sex);
  
  // Compute all relationships for this person on-the-fly
  const { people } = await loadPeopleGraph();
  const targetPerson = people.get(personId);
  
  if (!targetPerson) {
    return res.render('person-relationships', {
      person,
      house,
      nomen,
      relations: [],
      genderifyNomen
    });
  }

  const relations = [];
  const allPeople = Array.from(people.values());
  
  for (const otherPerson of allPeople) {
    if (otherPerson.id === personId) continue;
    
    const { allRelations } = targetPerson.findAllRelations(targetPerson, otherPerson);
    
    if (allRelations.length > 0) {
      for (const rel of allRelations) {
        // Extract ancestor details if available
        let ancestorData = {};
        if (rel.commonAncestor && rel.commonAncestor.id) {
          const ancestorDb = await getPersonById(rel.commonAncestor.id);
          if (ancestorDb) {
            const ancestorNomen = genderifyNomen(ancestorDb.nomen, ancestorDb.sex);
            ancestorData = {
              anc_praenomen: ancestorDb.praenomen,
              anc_nomen: ancestorNomen,
              anc_cognomen: ancestorDb.cognomen,
              anc_sex: ancestorDb.sex,
              anc_is_bastard: ancestorDb.is_bastard,
              anc_id: ancestorDb.id
            };
          }
        }
        
        relations.push({
          person1_id: personId,
          person2_id: otherPerson.id,
          relation_type: rel.type,
          relation_string: rel.relationString,
          distance: rel.distance,
          p1_praenomen: person.praenomen,
          p1_nomen: nomen,
          p1_cognomen: person.cognomen,
          p1_sex: person.sex,
          p1_is_bastard: person.is_bastard,
          p2_praenomen: otherPerson.name.split(' ')[0],
          p2_nomen: otherPerson.name,
          p2_cognomen: '',
          p2_sex: otherPerson.gender,
          ...ancestorData
        });
      }
    }
  }

  // Deduplicate relationships by (person2_id, relation_type, distance) and collect all ancestors
  const deduplicatedMap = new Map();
  for (const rel of relations) {
    const key = `${rel.person2_id}|${rel.relation_type}|${rel.distance}`;
    if (!deduplicatedMap.has(key)) {
      deduplicatedMap.set(key, {
        ...rel,
        ancestors: [] // Store array of ancestors
      });
    }
    
    // Add ancestor to the list if not already present
    if (rel.anc_id) {
      const existing = deduplicatedMap.get(key);
      const ancestorExists = existing.ancestors.some(a => a.anc_id === rel.anc_id);
      if (!ancestorExists) {
        existing.ancestors.push({
          anc_praenomen: rel.anc_praenomen,
          anc_nomen: rel.anc_nomen,
          anc_cognomen: rel.anc_cognomen,
          anc_sex: rel.anc_sex,
          anc_is_bastard: rel.anc_is_bastard,
          anc_id: rel.anc_id
        });
      }
    }
  }
  
  const deduplicatedRelations = Array.from(deduplicatedMap.values());
  deduplicatedRelations.sort((a, b) => a.distance - b.distance);

  res.render('person-relationships', {
    person,
    house,
    nomen,
    relations: deduplicatedRelations,
    genderifyNomen
  });
});

// Relationship statistics
app.get('/relationships/stats', async (req, res) => {
  const { people } = await loadPeopleGraph();
  
  // Count relationships per person on-the-fly
  const stats = [];
  const [allPeople] = await db.execute('SELECT * FROM person ORDER BY praenomen');
  
  let totalRelations = 0;
  
  for (const person of allPeople) {
    const personObj = people.get(person.id);
    if (!personObj) continue;
    
    let relationCount = 0;
    
    for (const otherPerson of people.values()) {
      if (otherPerson.id === person.id) continue;
      
      const { allRelations } = personObj.findAllRelations(personObj, otherPerson);
      if (allRelations.length > 0) {
        relationCount++;
      }
    }
    
    if (relationCount > 0) {
      totalRelations += relationCount;
    }
    
    stats.push({
      id: person.id,
      praenomen: person.praenomen,
      nomen: person.nomen,
      cognomen: person.cognomen,
      sex: person.sex,
      is_bastard: person.is_bastard,
      relation_count: relationCount
    });
  }
  
  // Divide by 2 since each relationship is counted twice (A->B and B->A)
  totalRelations = Math.floor(totalRelations / 2);
  
  stats.sort((a, b) => b.relation_count - a.relation_count);

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

// Get connection paths between two people
app.get('/api/relationship-paths/:person1Id/:person2Id', async (req, res) => {
  try {
    const person1Id = parseInt(req.params.person1Id);
    const person2Id = parseInt(req.params.person2Id);

    const person1 = await getPersonById(person1Id);
    const person2 = await getPersonById(person2Id);

    if (!person1 || !person2) {
      return res.status(404).json({ error: 'One or both people not found' });
    }

    const paths = await findPathsByIds(person1Id, person2Id);
    const { allRelations } = await findRelationshipByIds(person1Id, person2Id);

    // Convert paths to format suitable for display
    const formattedPaths = await Promise.all(paths.map(async (path, pathIdx) => {
      const pathDetails = await Promise.all(path.map(async (person) => {
        const dbPerson = await getPersonById(person.id);
        if (!dbPerson) {
          return { name: person.name, id: person.id };
        }
        const nomen = genderifyNomen(dbPerson.nomen, dbPerson.sex);
        return {
          id: person.id,
          praenomen: dbPerson.praenomen,
          nomen: nomen,
          cognomen: dbPerson.cognomen,
          name: person.name
        };
      }));

      // Find matching relation for this path based on distance
      const pathDistance = path.length - 1; // number of steps in path
      let matchedRelation = allRelations.find(r => r.distance === pathDistance);
      
      // If no exact match, find closest distance match
      if (!matchedRelation && allRelations.length > 0) {
        matchedRelation = allRelations.reduce((closest, rel) => {
          const currentDiff = Math.abs(rel.distance - pathDistance);
          const closestDiff = Math.abs(closest.distance - pathDistance);
          return currentDiff < closestDiff ? rel : closest;
        });
      }

      return {
        details: pathDetails,
        relationString: matchedRelation ? matchedRelation.relationString : 'Related',
        distance: pathDistance
      };
    }));

    res.json({
      person1: { id: person1Id, name: person1.praenomen },
      person2: { id: person2Id, name: person2.praenomen },
      paths: formattedPaths,
      pathCount: formattedPaths.length
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error computing paths' });
  }
});

// Compute all relationships (now computed on-the-fly, this is informational only)
app.post('/relationships/compute-all', async (req, res) => {
  try {
    const count = await computeAllRelationships();
    res.send(`Relationships computed on-the-fly. Found ${count} total relationship pairs.`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error computing relationships');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on http://localhost:' + PORT));