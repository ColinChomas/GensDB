const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: 'localhost',
  user: process.env.SQLUSER,
  password: process.env.SQLPASSWORD,
  database: 'gensDB',
});

async function createPartnershipsFromChildren() {
  const connection = await pool.getConnection();

  try {
    console.log('🔍 Finding all pairs of people who share children...\n');

    // Query to find all pairs of people who share at least one child
    // This joins parent_child twice to find two different people with the same child
    const [pairs] = await connection.execute(`
      SELECT DISTINCT
        LEAST(pc1.parent_id, pc2.parent_id) as person1_id,
        GREATEST(pc1.parent_id, pc2.parent_id) as person2_id,
        GROUP_CONCAT(DISTINCT c.praenomen) as shared_children
      FROM parent_child pc1
      JOIN parent_child pc2 
        ON pc1.child_id = pc2.child_id 
        AND pc1.parent_id < pc2.parent_id
      JOIN person c ON pc1.child_id = c.id
      JOIN person p1 ON pc1.parent_id = p1.id
      JOIN person p2 ON pc2.parent_id = p2.id
      WHERE pc1.relationship_type = 'biological'
        AND pc2.relationship_type = 'biological'
      GROUP BY person1_id, person2_id
      ORDER BY person1_id, person2_id
    `);

    console.log(`Found ${pairs.length} potential partnerships.\n`);

    let created = 0;
    let skipped = 0;

    for (const pair of pairs) {
      // Check if partnership already exists
      const [existing] = await connection.execute(
        `SELECT person1_id FROM partnership 
         WHERE (person1_id = ? AND person2_id = ?) 
            OR (person1_id = ? AND person2_id = ?)`,
        [pair.person1_id, pair.person2_id, pair.person2_id, pair.person1_id]
      );

      if (existing.length > 0) {
        console.log(`✓ Partnership already exists: ${pair.person1_id} ↔ ${pair.person2_id}`);
        skipped++;
      } else {
        // Get person names for display
        const [person1] = await connection.execute(
          `SELECT praenomen, nomen, cognomen FROM person WHERE id = ?`,
          [pair.person1_id]
        );
        const [person2] = await connection.execute(
          `SELECT praenomen, nomen, cognomen FROM person WHERE id = ?`,
          [pair.person2_id]
        );

        const p1Name = person1[0] ? `${person1[0].praenomen} ${person1[0].nomen || ''}`.trim() : `ID ${pair.person1_id}`;
        const p2Name = person2[0] ? `${person2[0].praenomen} ${person2[0].nomen || ''}`.trim() : `ID ${pair.person2_id}`;

        // Create partnership as confirmed
        await connection.execute(
          `INSERT INTO partnership (person1_id, person2_id, status) VALUES (?, ?, 'confirmed')`,
          [pair.person1_id, pair.person2_id]
        );

        console.log(`✔ Created: ${p1Name} ↔ ${p2Name} (shared child: ${pair.shared_children})`);
        created++;
      }
    }

    console.log(`\n✅ Done! Created ${created} partnerships, skipped ${skipped} existing ones.`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await connection.release();
    await pool.end();
  }
}

createPartnershipsFromChildren();
