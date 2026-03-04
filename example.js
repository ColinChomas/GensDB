const { createHouse } = require('./houseService');
const { createPerson } = require('./personService');
const { addParentChild, getChildrenOf } = require('./relationshipService');

async function main() {
  // 1. Create a gens
  const juliaHouseId = await createHouse('Julia');

  // 2. Create two parents
  const fatherId = await createPerson({ houseId: juliaHouseId, sex: 1, cognomen: 'Caesar' });
  const motherId = await createPerson({ houseId: juliaHouseId, sex: 0 });

  // 3. Create a child
  const childId = await createPerson({ houseId: juliaHouseId, sex: 1 });

  // 4. Link relationships
  await addParentChild(fatherId, childId, 'biological');
  await addParentChild(motherId, childId, 'biological');

  // 5. Fetch children of father
  const children = await getChildrenOf(fatherId);
  console.log('Children of father:', children);
}

main().catch(console.error);