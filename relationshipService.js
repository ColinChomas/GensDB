const db = require('./db');

async function addParentChild(parentId, childId, relationshipType = 'biological') {
  await db.execute(
    `INSERT INTO parent_child (parent_id, child_id, relationship_type)
     VALUES (?, ?, ?)`,
    [parentId, childId, relationshipType]
  );
}

async function getChildrenOf(parentId) {
  const [rows] = await db.execute(
    `SELECT p.*
     FROM parent_child pc
     JOIN person p ON pc.child_id = p.id
     WHERE pc.parent_id = ?`,
    [parentId]
  );
  return rows;
}

async function getParentsOf(childId) {
  const [rows] = await db.execute(
    `SELECT p.*
     FROM parent_child pc
     JOIN person p ON pc.parent_id = p.id
     WHERE pc.child_id = ?`,
    [childId]
  );
  return rows;
}

module.exports = { addParentChild, getChildrenOf, getParentsOf };