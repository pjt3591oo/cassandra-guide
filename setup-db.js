const cassandra = require('cassandra-driver');

const client = new cassandra.Client({
  contactPoints: ['localhost'],
  localDataCenter: 'datacenter1'
});

async function setupDatabase() {
  try {
    await client.connect();
    console.log('Connected to Cassandra');
    
    console.log('Creating keyspace...');
    await client.execute(`
      CREATE KEYSPACE IF NOT EXISTS test_keyspace
      WITH replication = {
        'class': 'SimpleStrategy',
        'replication_factor': 1
      }
    `);
    console.log('Keyspace created successfully');
    
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
    
    console.log('\nDatabase setup completed!');
    console.log('You can now run: npm test');
    
  } catch (error) {
    console.error('Error setting up database:', error);
  } finally {
    await client.shutdown();
  }
}

setupDatabase();