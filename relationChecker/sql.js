const db = require("../GensDB/db");

async function loadPeople(db) {
    const rows = await db.execute("SELECT * FROM person");

    const people = new Map();

    for (const row of rows) {
        const fullName = [row.praenomen, row.nomen, row.cognomen].filter(Boolean).join(" ");

        const gender = row.sex === 1 ? "male" : row.sex === 0 ? "female" : "unknown";

        const p = new Person(fullName, gender);
        p.id = row.id; // store SQL id

        people.set(row.id, p);
    }

    return people;
}

async function connectParents(db, people) {
    const rows = await db.execute("SELECT * FROM parent_child WHERE relationship_type='biological'");

    for (const row of rows) {
        const parent = people.get(row.parent_id);
        const child  = people.get(row.child_id);

        if (!parent || !child) continue;

        // Assign mother/father based on gender
        if (parent.gender === "female") {
            child.setMother(parent);
        } else if (parent.gender === "male") {
            child.setFather(parent);
        } else {
            // fallback: unknown gender → treat as parent but not mother/father
            parent.children.push(child);
        }
    }
}

async function loadGraph(db) {
    const people = await loadPeople(db);
    await connectParents(db, people);
    return people;
}

const people = await loadGraph(db);

const a = people.get(42);   // Aelor III
const b = people.get(17);   // Torrhen Frostdrake

const result = a.findRelation(a, b);

console.log(result.RelationString);

const { closest, allRelations } = a.findAllRelations(a, b);

console.log("Closest:", closest.relationString);
console.log("All paths:");
for (const r of allRelations) {
    console.log(" -", r.relationString, "(via", r.commonAncestor, ")");
}

async function storeRelations(db, p1, p2, allRelations) {
    for (const rel of allRelations) {
        await db.execute(`
            INSERT INTO person_relation
            (person1_id, person2_id, relation_type, relation_string, common_ancestor_id, distance)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [
            p1.id,
            p2.id,
            rel.type,
            rel.relationString,
            rel.commonAncestor ? peopleByName.get(rel.commonAncestor).id : null,
            rel.distance
        ]);
    }
}

export { loadGraph, storeRelations };