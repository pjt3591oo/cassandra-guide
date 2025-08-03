const cassandra = require('cassandra-driver');

const client = new cassandra.Client({
  contactPoints: ['localhost'],
  localDataCenter: 'datacenter1',
  keyspace: 'test_keyspace'
});

async function connectToDatabase() {
  try {
    await client.connect();
    console.log('Connected to Cassandra successfully');
  } catch (error) {
    console.error('Failed to connect to Cassandra:', error);
    process.exit(1);
  }
}

async function createUser(id, name, email, age) {
  const query = 'INSERT INTO users (id, name, email, age) VALUES (?, ?, ?, ?)';
  const params = [id, name, email, age];
  
  try {
    await client.execute(query, params, { prepare: true });
    console.log(`Created user: ${name}`);
  } catch (error) {
    console.error('Error creating user:', error);
  }
}

async function readUser(id) {
  const query = 'SELECT * FROM users WHERE id = ?';
  
  try {
    const result = await client.execute(query, [id], { prepare: true });
    if (result.rows.length > 0) {
      console.log('User found:', result.rows[0]);
      return result.rows[0];
    } else {
      console.log('User not found');
      return null;
    }
  } catch (error) {
    console.error('Error reading user:', error);
  }
}

async function readAllUsers() {
  const query = 'SELECT * FROM users';
  
  try {
    const result = await client.execute(query);
    console.log('All users:');
    result.rows.forEach(row => {
      console.log(`  ID: ${row.id}, Name: ${row.name}, Email: ${row.email}, Age: ${row.age}`);
    });
    return result.rows;
  } catch (error) {
    console.error('Error reading all users:', error);
  }
}

async function updateUser(id, name, email, age) {
  const query = 'UPDATE users SET name = ?, email = ?, age = ? WHERE id = ?';
  const params = [name, email, age, id];
  
  try {
    await client.execute(query, params, { prepare: true });
    console.log(`Updated user with ID: ${id}`);
  } catch (error) {
    console.error('Error updating user:', error);
  }
}

async function deleteUser(id) {
  const query = 'DELETE FROM users WHERE id = ?';
  
  try {
    await client.execute(query, [id], { prepare: true });
    console.log(`Deleted user with ID: ${id}`);
  } catch (error) {
    console.error('Error deleting user:', error);
  }
}

async function runCRUDTests() {
  console.log('=== Starting CRUD Tests ===\n');
  
  await connectToDatabase();
  
  console.log('\n--- CREATE Operation ---');
  await createUser(cassandra.types.Uuid.random(), 'John Doe', 'john@example.com', 30);
  await createUser(cassandra.types.Uuid.random(), 'Jane Smith', 'jane@example.com', 25);
  const testUserId = cassandra.types.Uuid.random();
  await createUser(testUserId, 'Test User', 'test@example.com', 35);
  
  console.log('\n--- READ Operation (All Users) ---');
  await readAllUsers();
  
  console.log('\n--- READ Operation (Single User) ---');
  await readUser(testUserId);
  
  console.log('\n--- UPDATE Operation ---');
  await updateUser(testUserId, 'Updated User', 'updated@example.com', 36);
  await readUser(testUserId);
  
  console.log('\n--- DELETE Operation ---');
  await deleteUser(testUserId);
  await readUser(testUserId);
  
  console.log('\n--- Final User List ---');
  await readAllUsers();
  
  await client.shutdown();
  console.log('\n=== CRUD Tests Completed ===');
}

runCRUDTests().catch(console.error);