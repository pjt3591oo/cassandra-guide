const cassandra = require('cassandra-driver');
const KEYSPACE_NAME = 'test_keyspace0';
const client = new cassandra.Client({
  contactPoints: ['localhost', 'localhost:9043', 'localhost:9044'],
  localDataCenter: 'datacenter1',
  keyspace: KEYSPACE_NAME,
  policies: {
    loadBalancing: new cassandra.policies.loadBalancing.RoundRobinPolicy()
  }
});

const consistencyLevels = {
  ONE: cassandra.types.consistencies.one,
  QUORUM: cassandra.types.consistencies.quorum,
  ALL: cassandra.types.consistencies.all,
  LOCAL_QUORUM: cassandra.types.consistencies.localQuorum
};

async function connectToCluster() {
  try {
    await client.connect();
    console.log('Connected to Cassandra cluster');
    const hosts = client.getState().getConnectedHosts();
    console.log(`Connected to ${hosts.length} nodes:`);
    hosts.forEach(host => {
      console.log(`  - ${host.address}:${host.port}`);
    });
  } catch (error) {
    console.error('Failed to connect to cluster:', error);
    process.exit(1);
  }
}

async function createUser(id, name, email, age, consistency = consistencyLevels.QUORUM) {
  const query = 'INSERT INTO users (id, name, email, age) VALUES (?, ?, ?, ?)';
  const params = [id, name, email, age];
  
  try {
    await client.execute(query, params, { 
      prepare: true,
      consistency: consistency 
    });
    // console.log(`Created user: ${name} (Consistency: ${getConsistencyName(consistency)})`);
  } catch (error) {
    console.error('Error creating user:', error.message);
  }
}

async function readUser(id, consistency = consistencyLevels.ONE) {
  const query = 'SELECT * FROM users WHERE id = ?';
  
  try {
    const result = await client.execute(query, [id], { 
      prepare: true,
      consistency: consistency 
    });
    if (result.rows.length > 0) {
      console.log(`User found (Consistency: ${getConsistencyName(consistency)}):`, result.rows[0]);
      return result.rows[0];
    } else {
      console.log('User not found');
      return null;
    }
  } catch (error) {
    console.error('Error reading user:', error.message);
  }
}

async function updateUser(id, name, email, age, consistency = consistencyLevels.QUORUM) {
  const query = 'UPDATE users SET name = ?, email = ?, age = ? WHERE id = ?';
  const params = [name, email, age, id];
  
  try {
    await client.execute(query, params, { 
      prepare: true,
      consistency: consistency 
    });
    console.log(`Updated user with ID: ${id} (Consistency: ${getConsistencyName(consistency)})`);
  } catch (error) {
    console.error('Error updating user:', error.message);
  }
}

async function deleteUser(id, consistency = consistencyLevels.QUORUM) {
  const query = 'DELETE FROM users WHERE id = ?';
  
  try {
    await client.execute(query, [id], { 
      prepare: true,
      consistency: consistency 
    });
    console.log(`Deleted user with ID: ${id} (Consistency: ${getConsistencyName(consistency)})`);
  } catch (error) {
    console.error('Error deleting user:', error.message);
  }
}

async function testConsistencyLevels() {
  console.log('\n--- Testing Different Consistency Levels ---');
  
  const testId = cassandra.types.Uuid.random();
  
  console.log('\n1. Write with ALL, Read with ONE:');
  await createUser(testId, 'Consistency Test', 'test@consistency.com', 99, consistencyLevels.ALL);
  await readUser(testId, consistencyLevels.ONE);
  
  console.log('\n2. Update with QUORUM:');
  await updateUser(testId, 'Updated Test', 'updated@consistency.com', 100, consistencyLevels.QUORUM);
  
  console.log('\n3. Read with LOCAL_QUORUM:');
  await readUser(testId, consistencyLevels.LOCAL_QUORUM);
  
  console.log('\n4. Delete with ONE (may not be immediately consistent):');
  await deleteUser(testId, consistencyLevels.ONE);
}

async function testNodeFailure() {
  console.log('\n--- Testing Node Failure Scenario ---');
  console.log('Stop one node with: docker stop cassandra-node3');
  console.log('Then press Enter to continue...');
  
  await new Promise(resolve => {
    process.stdin.once('data', resolve);
  });
  
  const testId = cassandra.types.Uuid.random();
  console.log('\nTesting with one node down:');
  
  try {
    await createUser(testId, 'Node Failure Test', 'failure@test.com', 50, consistencyLevels.QUORUM);
    console.log('QUORUM write successful with one node down');
  } catch (error) {
    console.error('QUORUM write failed:', error.message);
  }
  
  try {
    await readUser(testId, consistencyLevels.ONE);
    console.log('ONE read successful');
  } catch (error) {
    console.error('ONE read failed:', error.message);
  }
}

function getConsistencyName(consistency) {
  for (const [key, value] of Object.entries(consistencyLevels)) {
    if (value === consistency) return key;
  }
  return 'UNKNOWN';
}

async function runClusterTests() {
  console.log('=== Starting Cluster CRUD Tests ===\n');
  
  await connectToCluster();
  
  console.log('\n--- Basic CRUD Operations ---');
  for (let i = 0 ; i < 1_000; ++i) {

    const userId = cassandra.types.Uuid.random();
    console.log(userId.toString())
    
    await createUser(userId, `mung-${i}`, `mung-${i}@cluster.com`, 32);

    const replicas = await client.getReplicas(KEYSPACE_NAME, Buffer.from(userId.toString(), 'utf-8'));
    console.log(replicas.map(replica => replica.address).join(', '));
  }
  // await createUser(userId2, 'Bob Smith', 'bob@cluster.com', 32);
  // await createUser(userId3, 'Charlie Brown', 'charlie@cluster.com', 45);
  
  // await testConsistencyLevels();
  
  // console.log('\n--- Interactive Node Failure Test ---');
  // console.log('Would you like to test node failure scenario? (y/n)');
  
  // const rl = require('readline').createInterface({
  //   input: process.stdin,
  //   output: process.stdout
  // });
  
  // rl.question('', async (answer) => {
  //   if (answer.toLowerCase() === 'y') {
  //     await testNodeFailure();
  //   }
    
  //   await client.shutdown();
  //   console.log('\n=== Cluster Tests Completed ===');
  //   rl.close();
  //   process.exit(0);
  // });
}

runClusterTests().catch(console.error);