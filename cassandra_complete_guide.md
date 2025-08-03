# Apache Cassandra 완벽 가이드: 분산 NoSQL 데이터베이스 마스터하기

## 들어가며

Apache Cassandra는 Netflix, Instagram, Uber 같은 대규모 서비스에서 사용하는 분산 NoSQL 데이터베이스입니다. 이 글에서는 Cassandra의 핵심 개념부터 실무 활용까지 모든 것을 다뤄보겠습니다.

## 📋 목차

**🏗️ 기초 개념**
1. [Cassandra 동작 원리](#cassandra-동작-원리)
2. [키스페이스와 데이터 모델](#키스페이스와-데이터-모델)
3. [트랜잭션과 조인 제약사항](#트랜잭션과-조인-제약사항)

**🌐 아키텍처 설계**
4. [클러스터 구성과 링 구조](#클러스터-구성과-링-구조)
5. [복제와 가용성](#복제와-가용성)
6. [일관성 레벨](#일관성-레벨)
7. [멀티 데이터센터 아키텍처](#멀티-데이터센터-아키텍처)

**🛠️ 실무 활용**
8. [개발 도구와 GUI](#개발-도구와-gui)
9. [ScyllaDB 비교](#scylladb-비교)
10. [실무 팁과 권장사항](#실무-팁과-권장사항)

---

## Cassandra 동작 원리

### 분산 아키텍처의 핵심

Cassandra는 **마스터-슬레이브 구조가 없는 완전 분산 시스템**입니다. 모든 노드가 동등한 역할을 하며, 단일 장애 지점(SPOF)이 없어 높은 가용성을 제공합니다.

### Consistent Hashing과 파티셔닝

```
     Node A (0 ~ 85)
        ↗        ↘
Node D (255~0) ←→ Node B (85~170)
        ↖        ↙  
     Node C (170~255)
```

- 데이터는 **Consistent Hashing** 알고리즘으로 분산
- 각 노드는 토큰 범위를 담당
- 노드 추가/제거 시 최소한의 데이터 이동만 발생

### 쓰기 경로 (Write Path)

1. **Commit Log**: 모든 쓰기가 먼저 디스크의 commit log에 기록
2. **Memtable**: 메모리의 memtable에 데이터 저장
3. **SSTable**: memtable이 가득 차면 불변의 SSTable로 디스크에 플러시
4. **Compaction**: 주기적으로 SSTable들을 병합하여 성능 최적화

### 읽기 경로 (Read Path)

1. **Memtable 검색**: 먼저 메모리에서 데이터 찾기
2. **Bloom Filter**: SSTable에 데이터 존재 여부 빠르게 확인
3. **SSTable 검색**: 필요한 SSTable들에서 데이터 읽기
4. **Row Cache**: 자주 접근하는 행은 캐시에서 직접 반환

### Gossip 프로토콜

노드들은 **Gossip 프로토콜**로 클러스터 상태 정보를 공유합니다:

- 주기적으로 다른 노드들과 상태 정보 교환
- 노드 추가, 제거, 장애 정보 전파
- 중앙 집중식 코디네이터 없이도 클러스터 상태 유지

---

## 키스페이스와 데이터 모델

### 키스페이스(Keyspace)란?

키스페이스는 관계형 데이터베이스의 "데이터베이스"와 유사한 최상위 논리적 컨테이너입니다.

```sql
CREATE KEYSPACE IF NOT EXISTS my_app
WITH replication = {
  'class': 'SimpleStrategy',
  'replication_factor': 3
}
AND durable_writes = true;
```

### 복제 전략

**SimpleStrategy (단일 데이터센터)**
```sql
WITH replication = {
  'class': 'SimpleStrategy',
  'replication_factor': 3
}
```

**NetworkTopologyStrategy (다중 데이터센터)**
```sql
WITH replication = {
  'class': 'NetworkTopologyStrategy',
  'datacenter1': 3,
  'datacenter2': 2
}
```

### 기본 CQL 명령어

```sql
-- 키스페이스 목록 조회
DESCRIBE KEYSPACES;

-- 키스페이스 선택
USE my_app;

-- 테이블 목록 조회  
DESCRIBE TABLES;

-- 테이블 구조 확인
DESCRIBE TABLE users;

-- 시스템 테이블을 통한 조회
SELECT keyspace_name, table_name 
FROM system_schema.tables 
WHERE keyspace_name = 'my_app';
```

---

## 트랜잭션과 조인 제약사항

### 트랜잭션 지원 현황

**❌ 전통적인 ACID 트랜잭션 미지원**
```sql
-- 이런 멀티 테이블 트랜잭션은 불가능
BEGIN TRANSACTION;
  INSERT INTO users (id, name) VALUES (1, 'John');
  INSERT INTO orders (id, user_id, amount) VALUES (1, 1, 100);
COMMIT;
```

**✅ 제한적 트랜잭션 기능**

```sql
-- 1. Batch 문 (단일 파티션)
BEGIN BATCH
  INSERT INTO users (id, name, email) VALUES (1, 'John', 'john@email.com');
  UPDATE users SET last_login = '2025-01-01' WHERE id = 1;
APPLY BATCH;

-- 2. Lightweight Transactions (LWT)
INSERT INTO users (id, name) VALUES (1, 'John') IF NOT EXISTS;

UPDATE users SET email = 'new@email.com'
WHERE id = 1 IF email = 'old@email.com';
```

### 조인 대안 패턴

**❌ SQL JOIN 미지원**
```sql
-- 이런 JOIN은 불가능
SELECT u.name, o.amount 
FROM users u JOIN orders o ON u.id = o.user_id;
```

**✅ 비정규화 패턴**
```sql
-- 주문 테이블에 사용자 정보도 함께 저장
CREATE TABLE orders (
  order_id UUID PRIMARY KEY,
  user_id UUID,
  user_name TEXT,      -- 비정규화
  user_email TEXT,     -- 비정규화
  amount DECIMAL,
  order_date TIMESTAMP
);
```

**✅ 애플리케이션 레벨 조인**
```javascript
async function getUserWithOrders(userId) {
  // 1. 사용자 정보 조회
  const user = await client.execute(
    'SELECT * FROM users WHERE id = ?', [userId]
  );
  
  // 2. 주문 정보 조회  
  const orders = await client.execute(
    'SELECT * FROM orders WHERE user_id = ?', [userId]
  );
  
  // 3. 애플리케이션에서 결합
  return {
    ...user.rows[0],
    orders: orders.rows
  };
}
```

### 데이터 모델링 전략

이러한 제약사항들을 이해하고 **Query-First 설계**를 해야 합니다:

**전통적 정규화 (RDBMS) 방식:**
```sql
Table: users (id, name, email)
Table: orders (id, user_id, amount, date)
```

**Cassandra 비정규화 방식:**
```sql
-- 사용자별 주문 조회용 테이블
CREATE TABLE user_orders (
  user_id UUID,
  order_date TIMESTAMP,
  order_id UUID,
  user_name TEXT,
  user_email TEXT,
  amount DECIMAL,
  PRIMARY KEY (user_id, order_date)
) WITH CLUSTERING ORDER BY (order_date DESC);

-- 날짜별 주문 조회용 테이블  
CREATE TABLE orders_by_date (
  order_date DATE,
  order_time TIMESTAMP,
  order_id UUID,
  user_id UUID,
  amount DECIMAL,
  PRIMARY KEY (order_date, order_time)
);
```

### 언제 Cassandra가 부적합한가?

**❌ 다음과 같은 경우 Cassandra는 적합하지 않습니다:**
- 복잡한 JOIN 쿼리가 빈번한 시스템
- 강한 ACID 트랜잭션이 필수인 금융 시스템
- Ad-hoc 쿼리가 많은 분석 시스템
- 작은 규모의 프로젝트 (복잡성 > 이익)

**✅ 대신 이런 하이브리드 접근을 고려해보세요:**
```javascript
// 트랜잭션이 필요한 비즈니스 로직: PostgreSQL
await pgClient.query('BEGIN');
await pgClient.query('UPDATE accounts SET balance = balance - 100 WHERE id = 1');
await pgClient.query('UPDATE accounts SET balance = balance + 100 WHERE id = 2');
await pgClient.query('COMMIT');

// 고성능 읽기/쓰기: Cassandra  
await cassandraClient.execute(
  'INSERT INTO user_activities (user_id, timestamp, activity) VALUES (?, ?, ?)',
  [userId, new Date(), 'transfer_completed']
);
```

---

## 클러스터 구성과 링 구조

### Seed 노드의 역할

**Seed 노드 = 클러스터 진입점**

```yaml
# docker-compose.yml 예시
environment:
  - CASSANDRA_SEEDS=cassandra-node1,cassandra-node2
```

- 새로운 노드가 클러스터에 참여할 때 연결할 기존 노드들
- 전체 클러스터 토폴로지 정보를 제공
- 모든 노드가 seed일 필요 없음 (보통 2-3개)

### 4-노드 클러스터 예시

```
        Node A (0~63)
           ↗        ↘
Node D (192~255) ←→ Node B (64~127)  
           ↖        ↙
        Node C (128~191)
```

**클러스터는 하나의 논리적 링**으로 구성되며, 각 노드는 특정 토큰 범위를 담당합니다.

---

## 복제와 가용성

### Replication Factor (RF)

RF=3일 때 각 데이터는 **링에서 시계방향으로 연속된 3개 노드**에 저장됩니다.

```
Hash=100 (Node B 담당):
- Primary: Node B
- Replica: Node C (우측 1번째)
- Replica: Node D (우측 2번째)
```

### 각 노드의 역할

모든 노드가 **동일한 링에 참여하면서 Primary + Replica 데이터를 모두 저장**:

```
Node A: 
- Primary: Hash 0~63 데이터
- Replica: Hash 128~191, Hash 192~255 데이터

Node B:
- Primary: Hash 64~127 데이터  
- Replica: Hash 0~63, Hash 128~191 데이터
```

### 가용성 향상 효과

```
4-노드 클러스터, RF=3:
✅ 1개 노드 장애: 모든 데이터 접근 가능
✅ 2개 노드 장애: 대부분 데이터 접근 가능  
❌ 3개 노드 장애: 일부 데이터 접근 불가
```

---

## 일관성 레벨

### 일관성 레벨의 종류

```javascript
const consistencyLevels = {
  ONE: cassandra.types.consistencies.one,           // 1개 노드 응답
  QUORUM: cassandra.types.consistencies.quorum,     // 과반수 노드 응답
  ALL: cassandra.types.consistencies.all,           // 모든 노드 응답
  LOCAL_QUORUM: cassandra.types.consistencies.localQuorum  // 로컬 DC 과반수
};
```

### 성능 vs 일관성 트레이드오프

```
ONE < LOCAL_QUORUM < QUORUM < ALL
↑ 빠름                        ↑ 일관성 강함
↓ 일관성 약함                 ↓ 느림
```

### 실무 사용 예시

```javascript
// 사용자 조회 (빠른 응답 우선)
async function getUser(userId) {
  return await client.execute(
    'SELECT * FROM users WHERE id = ?', 
    [userId],
    {consistency: consistencyLevels.ONE}
  );
}

// 결제 처리 (강한 일관성 필요)
async function processPayment(paymentData) {
  return await client.execute(
    'INSERT INTO payments (id, amount, status) VALUES (?, ?, ?)',
    [paymentData.id, paymentData.amount, 'completed'],
    {consistency: consistencyLevels.ALL}
  );
}

// 일반 업데이트 (균형잡힌 접근)
async function updateProfile(userId, profileData) {
  return await client.execute(
    'UPDATE users SET name=?, email=? WHERE id=?',
    [profileData.name, profileData.email, userId],
    {consistency: consistencyLevels.QUORUM}
  );
}
```

---

## 멀티 데이터센터 아키텍처

### 왜 멀티 데이터센터가 필요한가?

**글로벌 서비스의 필수 요구사항:**
- **지역별 낮은 지연시간**: 사용자와 가까운 데이터센터에서 서비스
- **재해 복구**: 전체 데이터센터 장애에도 서비스 지속
- **법적 요구사항**: 데이터 지역화 (GDPR, 개인정보보호법)
- **트래픽 분산**: 지역별 부하 분산

### NetworkTopologyStrategy 심화

**기본 구성**
```sql
CREATE KEYSPACE global_app
WITH replication = {
  'class': 'NetworkTopologyStrategy',
  'US_East': 3,      -- 미국 동부 3개 복제본
  'US_West': 3,      -- 미국 서부 3개 복제본  
  'EU_Central': 2,   -- 유럽 중부 2개 복제본
  'Asia_Pacific': 2  -- 아시아 태평양 2개 복제본
}
AND durable_writes = true;
```

### 데이터센터별 복제 동작

**4개 데이터센터, 총 10개 복제본 예시:**

```
🇺🇸 US_East (3 replicas)     🇺🇸 US_West (3 replicas)
   Node1  Node2  Node3          Node4  Node5  Node6
     ↓      ↓      ↓              ↓      ↓      ↓
   Data   Data   Data           Data   Data   Data

🇪🇺 EU_Central (2 replicas)   🇰🇷 Asia_Pacific (2 replicas)  
   Node7  Node8                 Node9  Node10
     ↓      ↓                     ↓      ↓
   Data   Data                  Data   Data
```

**각 데이터는 모든 데이터센터에 복제되지만, 복제본 수는 데이터센터별로 다름**

### 멀티 DC 일관성 레벨

```javascript
const multiDcConsistency = {
  // 로컬 데이터센터만 고려 (가장 빠름)
  LOCAL_ONE: cassandra.types.consistencies.localOne,
  LOCAL_QUORUM: cassandra.types.consistencies.localQuorum,
  
  // 각 데이터센터별 QUORUM (강한 일관성)
  EACH_QUORUM: cassandra.types.consistencies.eachQuorum,
  
  // 전체 복제본 중 QUORUM
  QUORUM: cassandra.types.consistencies.quorum,
  
  // 모든 데이터센터의 모든 노드
  ALL: cassandra.types.consistencies.all
};
```

**지역별 성능 최적화 예시:**
```javascript
// 미국 사용자 요청 - US 데이터센터에서만 처리
async function getUserProfile_US(userId) {
  return await client.execute(
    'SELECT * FROM user_profiles WHERE id = ?',
    [userId],
    {consistency: multiDcConsistency.LOCAL_QUORUM}
  );
}

// 글로벌 일관성이 필요한 중요 데이터
async function updateGlobalConfiguration(config) {
  return await client.execute(
    'UPDATE global_config SET value = ? WHERE key = ?',
    [config.value, config.key],
    {consistency: multiDcConsistency.EACH_QUORUM}
  );
}
```

### Docker Compose 멀티 DC 시뮬레이션

```yaml
version: '3.8'

networks:
  dc1:
    driver: bridge
  dc2:
    driver: bridge
  dc_bridge:
    driver: bridge

services:
  # 데이터센터 1 (US_East)
  cassandra-dc1-node1:
    image: cassandra:latest
    networks:
      - dc1
      - dc_bridge
    environment:
      - CASSANDRA_CLUSTER_NAME=global-cluster
      - CASSANDRA_DC=US_East
      - CASSANDRA_RACK=rack1
      - CASSANDRA_SEEDS=cassandra-dc1-node1,cassandra-dc2-node1
      - CASSANDRA_ENDPOINT_SNITCH=GossipingPropertyFileSnitch
    ports:
      - "9042:9042"

  cassandra-dc1-node2:
    image: cassandra:latest
    networks:
      - dc1
      - dc_bridge
    environment:
      - CASSANDRA_CLUSTER_NAME=global-cluster
      - CASSANDRA_DC=US_East
      - CASSANDRA_RACK=rack2
      - CASSANDRA_SEEDS=cassandra-dc1-node1,cassandra-dc2-node1
      - CASSANDRA_ENDPOINT_SNITCH=GossipingPropertyFileSnitch
    ports:
      - "9043:9042"

  # 데이터센터 2 (EU_Central)  
  cassandra-dc2-node1:
    image: cassandra:latest
    networks:
      - dc2
      - dc_bridge
    environment:
      - CASSANDRA_CLUSTER_NAME=global-cluster
      - CASSANDRA_DC=EU_Central
      - CASSANDRA_RACK=rack1
      - CASSANDRA_SEEDS=cassandra-dc1-node1,cassandra-dc2-node1
      - CASSANDRA_ENDPOINT_SNITCH=GossipingPropertyFileSnitch
    ports:
      - "9044:9042"

  cassandra-dc2-node2:
    image: cassandra:latest
    networks:
      - dc2
      - dc_bridge
    environment:
      - CASSANDRA_CLUSTER_NAME=global-cluster
      - CASSANDRA_DC=EU_Central
      - CASSANDRA_RACK=rack2
      - CASSANDRA_SEEDS=cassandra-dc1-node1,cassandra-dc2-node1
      - CASSANDRA_ENDPOINT_SNITCH=GossipingPropertyFileSnitch
    ports:
      - "9045:9042"
```

### 애플리케이션 레벨 지역 라우팅

**Node.js 클라이언트 구성:**
```javascript
const cassandra = require('cassandra-driver');

// 지역별 클라이언트 설정
const clients = {
  US_East: new cassandra.Client({
    contactPoints: ['us-east-cassandra-1', 'us-east-cassandra-2'],
    localDataCenter: 'US_East',
    consistency: cassandra.types.consistencies.localQuorum
  }),
  
  EU_Central: new cassandra.Client({
    contactPoints: ['eu-central-cassandra-1', 'eu-central-cassandra-2'], 
    localDataCenter: 'EU_Central',
    consistency: cassandra.types.consistencies.localQuorum
  }),
  
  Asia_Pacific: new cassandra.Client({
    contactPoints: ['asia-cassandra-1', 'asia-cassandra-2'],
    localDataCenter: 'Asia_Pacific', 
    consistency: cassandra.types.consistencies.localQuorum
  })
};

// 사용자 지역에 따른 클라이언트 선택
function getRegionalClient(userRegion) {
  return clients[userRegion] || clients.US_East; // 기본값
}

// 지역별 요청 처리
async function handleUserRequest(userId, userRegion, requestData) {
  const client = getRegionalClient(userRegion);
  
  return await client.execute(
    'SELECT * FROM users WHERE id = ?',
    [userId],
    {consistency: cassandra.types.consistencies.localQuorum}
  );
}
```

### 장애 격리와 복구

**데이터센터 장애 시나리오:**

```
정상 상태:
US_East: ✅✅✅ (3 nodes)
EU_Central: ✅✅ (2 nodes)  
Asia_Pacific: ✅✅ (2 nodes)

EU_Central 전체 장애:
US_East: ✅✅✅ (서비스 계속)
EU_Central: ❌❌ (완전 장애)
Asia_Pacific: ✅✅ (서비스 계속)

→ EU 사용자는 US_East로 라우팅되어 서비스 지속
```

**자동 장애조치 로직:**
```javascript
async function executeWithFailover(query, params, primaryRegion) {
  const fallbackRegions = ['US_East', 'EU_Central', 'Asia_Pacific']
    .filter(region => region !== primaryRegion);
  
  try {
    // 주 지역에서 시도
    const primaryClient = clients[primaryRegion];
    return await primaryClient.execute(query, params);
  } catch (error) {
    console.log(`Primary region ${primaryRegion} failed, trying fallback...`);
    
    // 대체 지역에서 시도
    for (const region of fallbackRegions) {
      try {
        const fallbackClient = clients[region];
        return await fallbackClient.execute(query, params, {
          consistency: cassandra.types.consistencies.quorum // 더 강한 일관성
        });
      } catch (fallbackError) {
        console.log(`Fallback region ${region} also failed`);
      }
    }
    
    throw new Error('All regions failed');
  }
}
```

### 글로벌 서비스 최적화 패턴

**1. 읽기 최적화 (Read Optimization)**
```javascript
// 지역별 읽기 전용 복제본 활용
const readOnlyQueries = {
  // 로컬에서만 읽기 (가장 빠름)
  getUserDashboard: {
    consistency: cassandra.types.consistencies.localOne
  },
  
  // 지역 내 일관성 보장
  getUserProfile: {
    consistency: cassandra.types.consistencies.localQuorum  
  }
};
```

**2. 쓰기 전략 (Write Strategy)**
```javascript
const writeStrategies = {
  // 로컬 쓰기 (사용자 활동 로그)
  logUserActivity: {
    consistency: cassandra.types.consistencies.localOne
  },
  
  // 지역별 일관성 (사용자 프로필 업데이트)
  updateUserProfile: {
    consistency: cassandra.types.consistencies.localQuorum
  },
  
  // 글로벌 일관성 (시스템 설정)
  updateGlobalConfig: {
    consistency: cassandra.types.consistencies.eachQuorum
  }
};
```

**3. 데이터 지역화 (Data Localization)**
```sql
-- 지역별 테이블 분리
CREATE TABLE user_profiles_us (
  user_id UUID PRIMARY KEY,
  name TEXT,
  email TEXT,
  region TEXT
) WITH comment = 'US users only';

CREATE TABLE user_profiles_eu (
  user_id UUID PRIMARY KEY, 
  name TEXT,
  email TEXT,
  region TEXT
) WITH comment = 'EU users only - GDPR compliant';
```

### 멀티 DC 모니터링

**핵심 메트릭:**
```javascript
// 데이터센터별 지연시간 모니터링
const dcLatencyMetrics = {
  'US_East': {
    read_latency_p99: '2ms',
    write_latency_p99: '5ms', 
    cross_dc_latency: '150ms'
  },
  'EU_Central': {
    read_latency_p99: '3ms',
    write_latency_p99: '6ms',
    cross_dc_latency: '200ms'  
  }
};

// 복제 지연 모니터링 
const replicationMetrics = {
  'US_East_to_EU_Central': '50ms',
  'US_East_to_Asia_Pacific': '180ms',
  'EU_Central_to_Asia_Pacific': '230ms'
};
```

**알림 설정:**
```yaml
# Prometheus 알림 규칙 예시
groups:
- name: cassandra_multi_dc
  rules:
  - alert: CrossDCReplicationLag
    expr: cassandra_replication_lag_seconds > 1
    labels:
      severity: warning
    annotations:
      summary: "Cross-DC replication lag is high"
      
  - alert: DataCenterDown
    expr: up{job="cassandra",dc="EU_Central"} == 0
    labels:
      severity: critical
    annotations:
      summary: "Entire datacenter is down"
```

### 실제 운영 고려사항

**네트워크 대역폭 관리:**
```
- 데이터센터 간 WAN 대역폭 비용 고려
- 압축 활성화로 네트워크 사용량 최소화  
- 중요하지 않은 데이터는 로컬 복제만 고려
```

**보안 및 암호화:**
```yaml
# 데이터센터 간 암호화 설정
cassandra.yaml:
  internode_encryption: dc
  client_encryption_enabled: true
  certificate_authorities: [ca-cert.pem]
```

**백업 전략:**
```bash
# 지역별 백업 스케줄
# US_East: 매일 02:00 UTC
# EU_Central: 매일 23:00 UTC  
# Asia_Pacific: 매일 14:00 UTC

nodetool snapshot -cf user_profiles my_keyspace
```

### 멀티 DC 아키텍처 장점 요약

**🚀 성능:**
- 사용자와 가까운 데이터센터에서 응답
- 지역별 최적화된 일관성 레벨 설정

**🛡️ 가용성:**
- 전체 데이터센터 장애에도 서비스 지속
- 자동 장애조치 및 복구

**⚖️ 규정 준수:**
- 데이터 지역화 요구사항 충족
- GDPR, 개인정보보호법 대응

**💰 비용 효율성:**
- 지역별 필요에 따른 복제본 수 조절
- 네트워크 비용 최적화

멀티 데이터센터 아키텍처는 **Cassandra의 진정한 강점**이 드러나는 영역입니다. Netflix, Uber 같은 글로벌 서비스가 Cassandra를 선택하는 핵심 이유 중 하나죠!

---

## 개발 도구와 GUI

### 무료 GUI 도구 추천

**1순위: DBeaver Community** 🥇
- 완전 무료, 오픈소스
- 가장 안정적이고 성숙한 도구
- Cassandra 네이티브 지원

```bash
# 설치
brew install --cask dbeaver-community

# 연결 설정
Host: localhost
Port: 9042
Authentication: None
```

**2순위: Cassandra Web** 🥈
- 브라우저에서 바로 사용
- Docker로 1분 만에 설치

```bash
docker run -d --name cassandra-web \
  -p 3000:3000 \
  -e CASSANDRA_HOST=localhost \
  -e CASSANDRA_PORT=9042 \
  markusgulden/cassandra-web
```

### Docker Compose에 GUI 추가

```yaml
services:
  cassandra-web:
    image: markusgulden/cassandra-web
    ports:
      - "3000:3000"
    environment:
      - CASSANDRA_HOST=cassandra-node1
      - CASSANDRA_PORT=9042
    depends_on:
      - cassandra-node1
    networks:
      - cassandra-network
```

---

## ScyllaDB 비교

### ScyllaDB = "더 빠른 Cassandra"

ScyllaDB는 Cassandra와 **거의 동일한 구조**를 가지지만 C++로 재구현하여 성능을 대폭 개선한 버전입니다.

### 동일한 특징

```sql
-- Cassandra와 동일한 CQL 문법
CREATE KEYSPACE test WITH replication = {
  'class': 'SimpleStrategy',
  'replication_factor': 3
};
```

```javascript
// 동일한 드라이버 코드
const client = new cassandra.Client({
  contactPoints: ['scylla-node1'],  // 접속점만 변경
  localDataCenter: 'datacenter1'
});
```

### 성능 차이

| 구분 | Cassandra | ScyllaDB |
|------|-----------|----------|
| **언어** | Java | C++ |
| **성능** | 100K ops/sec | 1M ops/sec (10배) |
| **지연시간** | ~10ms (99th) | ~1ms (99th) |
| **메모리** | JVM GC 이슈 | 직접 메모리 관리 |

### 선택 기준

**ScyllaDB 권장:**
- 높은 성능이 중요한 경우
- 대용량 트래픽 처리
- 하드웨어 비용 절약

**Cassandra 권장:**
- 기존 생태계 활용
- 검증된 안정성 우선
- Java 기반 툴링 필요

---

## 실무 팁과 권장사항

### 데이터 모델링 원칙

**Query-First 설계**
```sql
-- 쿼리 패턴에 맞춰 테이블 설계
-- "사용자별 주문 조회"가 자주 필요하다면:
CREATE TABLE orders_by_user (
  user_id UUID,
  order_date TIMESTAMP,
  order_id UUID,
  amount DECIMAL,
  PRIMARY KEY (user_id, order_date)
) WITH CLUSTERING ORDER BY (order_date DESC);
```

### 클러스터 구성 권장사항

```yaml
# 프로덕션용 3-노드 클러스터
version: '3.8'
services:
  cassandra-node1:
    image: cassandra:latest
    environment:
      - CASSANDRA_CLUSTER_NAME=prod-cluster
      - CASSANDRA_SEEDS=cassandra-node1,cassandra-node2
      - CASSANDRA_DC=datacenter1
      - CASSANDRA_RACK=rack1
    
  cassandra-node2:
    image: cassandra:latest
    environment:
      - CASSANDRA_CLUSTER_NAME=prod-cluster
      - CASSANDRA_SEEDS=cassandra-node1,cassandra-node2
      - CASSANDRA_DC=datacenter1
      - CASSANDRA_RACK=rack2
      
  cassandra-node3:
    image: cassandra:latest
    environment:
      - CASSANDRA_CLUSTER_NAME=prod-cluster
      - CASSANDRA_SEEDS=cassandra-node1,cassandra-node2
      - CASSANDRA_DC=datacenter1
      - CASSANDRA_RACK=rack3
```

### 성능 최적화 팁

**키스페이스 설정**
```sql
-- 프로덕션 환경
CREATE KEYSPACE production_app
WITH replication = {
  'class': 'NetworkTopologyStrategy',
  'datacenter1': 3
}
AND durable_writes = true;
```

**일관성 레벨 전략**
```javascript
// 읽기 전략
const readStrategies = {
  dashboard: consistencyLevels.ONE,      // 실시간 대시보드
  userProfile: consistencyLevels.QUORUM, // 사용자 프로필  
  financial: consistencyLevels.ALL       // 금융 데이터
};

// 쓰기 전략  
const writeStrategies = {
  logs: consistencyLevels.ONE,           // 로그 데이터
  general: consistencyLevels.QUORUM,     // 일반 업데이트
  critical: consistencyLevels.ALL        // 중요 거래
};
```

### 모니터링과 운영

**주요 메트릭**
- 읽기/쓰기 지연시간
- 노드별 부하 분산
- Compaction 성능
- GC 성능 (Cassandra) / CPU 사용률 (ScyllaDB)

**백업 전략**
```bash
# 스냅샷 생성
nodetool snapshot my_keyspace

# 증분 백업 활성화
nodetool enableautocompaction
```

---

## 마무리

Apache Cassandra는 **대규모 분산 환경에서 높은 성능과 가용성을 제공하는 훌륭한 NoSQL 데이터베이스**입니다. 

### 핵심 기억할 점

1. **완전 분산 아키텍처**: 마스터 없는 P2P 구조
2. **링 기반 데이터 분산**: Consistent Hashing으로 균등 분산
3. **튜닝 가능한 일관성**: CAP 정리에 따른 유연한 설정
4. **Query-First 모델링**: 쿼리 패턴에 맞춘 데이터 설계
5. **제약사항 이해**: 트랜잭션/조인 제한과 대안 패턴

### 언제 Cassandra를 선택할까?

**✅ 적합한 경우:**
- 대용량 데이터 처리
- 높은 쓰기 성능 필요
- 글로벌 분산 서비스
- 99.99% 가용성 요구

**❌ 부적합한 경우:**
- 복잡한 JOIN 쿼리 필요
- 강한 ACID 트랜잭션 필요
- 소규모 프로젝트
- 분석 위주의 워크로드

Cassandra를 제대로 활용하려면 **기존 RDBMS 사고방식에서 벗어나 분산 시스템의 특성을 이해하는 것**이 가장 중요합니다. 올바른 데이터 모델링과 적절한 일관성 레벨 설정으로 Netflix, Instagram 수준의 확장성을 달성할 수 있습니다.

---

### 참고 자료

- [Apache Cassandra 공식 문서](https://cassandra.apache.org/doc/)
- [DataStax Academy](https://academy.datastax.com/)
- [Cassandra 모범 사례](https://docs.datastax.com/en/dse/6.8/cql/cql/cql_using/useWhenToUseCassandra.html)
- [ScyllaDB vs Cassandra 비교](https://www.scylladb.com/product/benchmarks/)

*이 가이드가 도움이 되셨다면 실제 프로젝트에 적용해보시고, 궁금한 점은 언제든 댓글로 남겨주세요!*