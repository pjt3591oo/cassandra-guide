const cassandra = require('cassandra-driver');

const client = new cassandra.Client({
  contactPoints: ['localhost', 'localhost:9043', 'localhost:9044'],
  localDataCenter: 'datacenter1'
});

async function setupClusterDatabase() {
  try {
    await client.connect();
    console.log('Connected to Cassandra cluster');
    
    console.log('Creating keyspace with replication factor 3...');
    
    // Replicate to 3 nodes in datacenter1
    await client.execute(`
      CREATE KEYSPACE IF NOT EXISTS test_keyspace
      WITH replication = {
        'class': 'NetworkTopologyStrategy',
        'datacenter1': 3 
      }
      AND durable_writes = true
    `);
    console.log('Keyspace created with RF=3');
    
    await client.execute('USE test_keyspace');
    
    console.log('Creating users table...');
    await client.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        name TEXT,
        email TEXT,
        age INT
      )
    `);
    console.log('Users table created successfully');
    
    console.log('\nChecking cluster status...');
    const result = await client.execute('SELECT * FROM system.peers');
    console.log(`Cluster has ${result.rows.length + 1} nodes`);
    
    console.log('\nCluster database setup completed!');
    console.log('You can now run: npm run test-cluster');
    
  } catch (error) {
    console.error('Error setting up cluster database:', error);
  } finally {
    await client.shutdown();
  }
}

setupClusterDatabase();