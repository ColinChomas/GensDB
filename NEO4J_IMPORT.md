# GensDB to Neo4j Import Guide

This guide provides Cypher queries to import GensDB CSV exports into Neo4j.

## Prerequisites

1. Export your data from GensDB using the multi-house export feature (sample_export2.csv)
2. Have Neo4j running with the Neo4j Browser open
3. The CSV file should be in your Neo4j import directory (or use full path in queries)

---

## Step 1: Clear Existing Data (Optional)

Run this if you want a clean import:

```cypher
MATCH (n) 
DETACH DELETE n;
```

---

## Step 2: Create House Nodes

```cypher
LOAD CSV WITH HEADERS FROM 'file:///sample_export2.csv' AS row
WITH DISTINCT row.house_name AS houseName
CREATE (h:House {name: houseName})
RETURN COUNT(h) as houses_created;
```

---

## Step 3: Create Person Nodes

```cypher
LOAD CSV WITH HEADERS FROM 'file:///sample_export2.csv' AS row
MATCH (h:House {name: row.house_name})
CREATE (p:Person {
  temp_id: row.temp_id,
  praenomen: row.praenomen,
  nomen: row.nomen,
  cognomen: row.cognomen,
  sex: toInteger(row.sex),
  is_bastard: toInteger(row.is_bastard),
  birth_year: CASE WHEN row.birth_year = '' THEN null ELSE toInteger(row.birth_year) END,
  death_year: CASE WHEN row.death_year = '' THEN null ELSE toInteger(row.death_year) END,
  full_name: row.praenomen + ' ' + row.nomen + CASE WHEN row.cognomen <> '' THEN ' ' + row.cognomen ELSE '' END
})
CREATE (p)-[:MEMBER_OF]->(h)
RETURN COUNT(p) as people_created;
```

---

## Step 4: Create Father Relationships

```cypher
LOAD CSV WITH HEADERS FROM 'file:///sample_export2.csv' AS row
WITH row WHERE row.father_temp_id <> ''
MATCH (father:Person {temp_id: row.father_temp_id})
MATCH (child:Person {temp_id: row.temp_id})
CREATE (father)-[:FATHER_OF]->(child)
RETURN COUNT(*) as father_relationships_created;
```

---

## Step 5: Create Mother Relationships

```cypher
LOAD CSV WITH HEADERS FROM 'file:///sample_export2.csv' AS row
WITH row WHERE row.mother_temp_id <> ''
MATCH (mother:Person {temp_id: row.mother_temp_id})
MATCH (child:Person {temp_id: row.temp_id})
CREATE (mother)-[:MOTHER_OF]->(child)
RETURN COUNT(*) as mother_relationships_created;
```

---

## Step 6: Create Indexes (For Performance)

```cypher
CREATE INDEX person_temp_id IF NOT EXISTS FOR (p:Person) ON (p.temp_id);
CREATE INDEX person_name IF NOT EXISTS FOR (p:Person) ON (p.full_name);
CREATE INDEX house_name IF NOT EXISTS FOR (h:House) ON (h.name);
```

---

## Syncing Parent-Child Relationships Across Datasets

If you have another dataset in the same Neo4j instance with the same characters (e.g., from a book like Game of Thrones) but without family relationships, you can copy them from your GensDB data.

### Match people by full name and create relationships

```cypher
// Using full_name from GensDB to match against other dataset
MATCH (gensdb_father:Person {praenomen: 'Rhaegar'})-[:FATHER_OF]->(gensdb_child:Person)
WITH gensdb_father, gensdb_child, gensdb_child.full_name as child_name
MATCH (other_child:Person {full_name: child_name})
WHERE NOT (other_child)-[:FATHER_OF]-(:Person)  // Avoid duplicates
MATCH (other_father:Person {full_name: gensdb_father.full_name})
WHERE NOT (other_father)-[:FATHER_OF]->(:Person)
MERGE (other_father)-[:FATHER_OF]->(other_child)
RETURN COUNT(*) as relationships_created;
```

### Match by forename + surname combination

If names don't match exactly, try matching by components:

```cypher
MATCH (gensdb_father:Person)-[:FATHER_OF]->(gensdb_child:Person)
WITH gensdb_father, gensdb_child
MATCH (other_father:Person {forename: gensdb_father.praenomen, surname: gensdb_father.nomen})
MATCH (other_child:Person {forename: gensdb_child.praenomen, surname: gensdb_child.nomen})
MERGE (other_father)-[:FATHER_OF]->(other_child)
RETURN COUNT(*) as father_relationships_created;
```

### Same for mothers

```cypher
MATCH (gensdb_mother:Person)-[:MOTHER_OF]->(gensdb_child:Person)
WITH gensdb_mother, gensdb_child
MATCH (other_mother:Person {forename: gensdb_mother.praenomen, surname: gensdb_mother.nomen})
MATCH (other_child:Person {forename: gensdb_child.praenomen, surname: gensdb_child.nomen})
MERGE (other_mother)-[:MOTHER_OF]->(other_child)
RETURN COUNT(*) as mother_relationships_created;
```

### Preview matching before creating relationships

To verify your matches first:

```cypher
MATCH (gensdb_person:Person {praenomen: 'Targaryen'})
MATCH (other_person:Person {surname: 'Targaryen'})
WHERE gensdb_person.praenomen = other_person.forename
RETURN gensdb_person.full_name as GensDB_Person, other_person.full_name as Other_Dataset_Person;
```

### Count all nodes and relationships

```cypher
MATCH (n)
RETURN labels(n)[0] as type, COUNT(n) as count
UNION ALL
MATCH ()-[r]->()
RETURN type(r) as type, COUNT(r) as count;
```

### View all houses

```cypher
MATCH (h:House)<-[:MEMBER_OF]-(p:Person)
RETURN h.name as House, COUNT(DISTINCT p) as Members
ORDER BY h.name;
```

### Find all descendants of a person (e.g., Augustus)

```cypher
MATCH (p:Person {praenomen: 'Augustus'})-[:FATHER_OF|MOTHER_OF*]->(descendants:Person)
RETURN p.full_name as Ancestor, descendants.full_name as Descendant, descendants.birth_year as BornYear;
```

### Find cross-house marriages (mothers from different houses)

```cypher
MATCH (f:Person)-[:FATHER_OF]->(child:Person)
MATCH (m:Person)-[:MOTHER_OF]->(child)
MATCH (f)-[:MEMBER_OF]->(h1:House)
MATCH (m)-[:MEMBER_OF]->(h2:House)
WHERE h1.name <> h2.name
RETURN child.full_name as Child, f.full_name as Father, h1.name as Father_House, 
       m.full_name as Mother, h2.name as Mother_House;
```

### View family tree for a person (3 generations)

```cypher
MATCH path = (ancestor:Person)-[:FATHER_OF|MOTHER_OF*0..2]->(p:Person {praenomen: 'Nero'})
RETURN path;
```

---

## Notes

- Replace `'file:///sample_export2.csv'` with your actual CSV filename
- If CSV is not in the import directory, use the full path: `'file:///C:/path/to/your/file.csv'`
- Empty values in CSV (like blank father_temp_id) are handled with the `WHERE` clause to skip null relationships
- The queries maintain referential integrity through temp_id matching
