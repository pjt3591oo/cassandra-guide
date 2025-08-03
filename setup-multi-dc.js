const cassandra = require('cassandra-driver');

const client = new cassandra.Client({
  contactPoints: ['localhost', 'localhost:9043', 'localhost:9044', 'localhost:9045'],
  localDataCenter: 'us-east'  // 연결할 primary datacenter
});

async function setupMultiDCDatabase() {
  try {
    await client.connect();
    console.log('Connected to Multi-DC Cassandra cluster');
    
    console.log('Creating keyspace with multi-DC replication...');
    await client.execute(`
      CREATE KEYSPACE IF NOT EXISTS multi_dc_keyspace
      WITH replication = {
        'class': 'NetworkTopologyStrategy',
        'us-east': 2,
        'eu-west': 2
      }
      AND durable_writes = true
    `);
    console.log('Multi-DC Keyspace created');
    
    await client.execute('USE multi_dc_keyspace');
    
    console.log('Creating users table...');
    await client.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        name TEXT,
        email TEXT,
        age INT,
        datacenter TEXT,
        created_at TIMESTAMP
      )
    `);
    console.log('Users table created');
    
    console.log('\nChecking datacenter topology...');
    const result = await client.execute(`
      SELECT data_center, rack, host_id 
      FROM system.local
      UNION ALL
      SELECT data_center, rack, host_id 
      FROM system.peers
    `);
    
    console.log('Datacenter topology:');
    const dcMap = {};
    result.rows.forEach(row => {
      const dc = row.data_center;
      if (!dcMap[dc]) dcMap[dc] = 0;
      dcMap[dc]++;
    });
    
    Object.entries(dcMap).forEach(([dc, count]) => {
      console.log(`  ${dc}: ${count} nodes`);
    });
    
    console.log('\nMulti-DC database setup completed!');
    console.log('You can now run multi-DC tests');
    
  } catch (error) {
    console.error('Error setting up multi-DC database:', error);
  } finally {
    await client.shutdown();
  }
}

setupMultiDCDatabase();