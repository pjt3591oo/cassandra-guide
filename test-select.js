const cassandra = require('cassandra-driver');
const KEYSPACE_NAME = 'test_keyspace0';
const client = new cassandra.Client({
  contactPoints: ['localhost', 'localhost:9043', ],
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



async function runClusterTests() {
   
  await connectToCluster();
  
  const userUuids = [
    "c31f0382-1ea5-4c33-afe2-3c7e55fdfedf",
    "d9ebe5ab-2fce-4701-9c1c-96e553be0abf",
    "601fe03b-2deb-42b1-b633-08bebdddac65",
    "f21d435b-6511-4141-810c-e7d454c7628f",
    "644807fe-b133-4389-a8aa-b5ea771370ee",
    "3fce4f4f-75b0-4621-b260-db77b66e10a8",
    "72a38e65-f5ac-4db6-a909-f3f0c3870aa9",
    "5985752d-f2e4-411a-9da0-ae50f62f3bc3",
    "2dbbab84-c4eb-4ee0-910f-eb2960c5b5e4",
    "95a66361-a601-441b-a71f-8b1d253c61da",
    "0fee6ce5-a722-4548-a5d4-04526b57b1df",
    "f7c373f6-38f2-469e-ae98-9d215805fa11",
    "e9d3bf8d-6cf3-483c-a18f-7376f24bb8a5",
    "bd2bff09-2b18-4b4f-bfa7-9c10ec94526e",
    "a4e93883-37ef-48f5-8d49-388bb085d538",
    "1de58cfb-0bae-42aa-a631-4786ed59f46f",
    "866ad2ef-094d-4171-a97e-b9dd65161d24",
    "fb50794a-00ea-4745-8715-110b11ddf448",
    "7f18f379-0fea-474e-92b7-40edb9303a35",
    "38ed5178-cfe1-4654-a137-49b0fb77d92d",
    "8c6594ab-d926-4191-8469-08e636a7d624",
    "87f0de15-fe54-48b4-96b2-50dbdf768367",
    "31845c32-b413-4d56-a624-fa269a2034c9",
  ]
  
  for (const userUuid of userUuids) {

    const replicas = await client.getReplicas(KEYSPACE_NAME, Buffer.from(userUuid, 'utf-8'));
    console.log(replicas.map(replica => replica.address).join(', '));
  }
}

runClusterTests().catch(console.error);