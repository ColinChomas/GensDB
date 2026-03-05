const db = require('./db');
const { Person } = require('./RelationChecker');
const { genderifyNomen } = require('./romanNaming');

/**
 * Load all people from the database into Person objects
 */
async function loadPeopleGraph() {
  const [rows] = await db.execute('SELECT * FROM person');

  const people = new Map(); // id -> Person
  const peopleByName = new Map(); // name -> Person

  // Create Person objects
  for (const row of rows) {
    const nomen = genderifyNomen(row.nomen, row.sex);
    const fullName = [row.praenomen, nomen, row.cognomen].filter(Boolean).join(' ');
    const gender = row.sex === 1 ? 'male' : row.sex === 0 ? 'female' : 'unknown';

    const p = new Person(fullName, gender);
    p.id = row.id; // store SQL id for later

    people.set(row.id, p);
    peopleByName.set(fullName, p);
  }

  // Connect parent-child relationships
  const [relationships] = await db.execute(
    "SELECT * FROM parent_child WHERE relationship_type='biological'"
  );

  for (const row of relationships) {
    const parent = people.get(row.parent_id);
    const child = people.get(row.child_id);

    if (!parent || !child) continue;

    // Assign mother/father based on gender
    if (parent.gender === 'female') {
      child.setMother(parent);
    } else if (parent.gender === 'male') {
      child.setFather(parent);
    }
  }

  return { people, peopleByName };
}

/**
 * Find relationship between two people by their IDs
 */
async function findRelationshipByIds(person1Id, person2Id) {
  const { people } = await loadPeopleGraph();

  const p1 = people.get(person1Id);
  const p2 = people.get(person2Id);

  if (!p1 || !p2) {
    throw new Error('One or both people not found');
  }

  return p1.findAllRelations(p1, p2);
}

/**
 * Find all paths between two people by their IDs
 */
async function findPathsByIds(person1Id, person2Id) {
  const { people } = await loadPeopleGraph();

  const p1 = people.get(person1Id);
  const p2 = people.get(person2Id);

  if (!p1 || !p2) {
    throw new Error('One or both people not found');
  }

  return p1.findAllPaths(p1, p2);
}

/**
 * Compute all relationships (in-memory only, no storage)
 */
async function computeAllRelationships() {
  const { people } = await loadPeopleGraph();
  const personIds = Array.from(people.keys());

  let count = 0;

  // Compute relationships for all pairs
  for (let i = 0; i < personIds.length; i++) {
    for (let j = i + 1; j < personIds.length; j++) {
      const id1 = personIds[i];
      const id2 = personIds[j];

      const p1 = people.get(id1);
      const p2 = people.get(id2);

      const { allRelations } = p1.findAllRelations(p1, p2);

      if (allRelations.length > 0) {
        count++;
      }
    }
  }

  return count;
}

module.exports = {
  loadPeopleGraph,
  findRelationshipByIds,
  findPathsByIds,
  computeAllRelationships
};
