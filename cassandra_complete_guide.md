# Apache Cassandra 완벽 가이드: 분산 NoSQL 데이터베이스 마스터하기

## 들어가며

Apache Cassandra는 Netflix, Instagram, Uber 같은 대규모 서비스에서 사용하는 분산 NoSQL 데이터베이스입니다. 이 글에서는 Cassandra의 핵심 개념부터 실무 활용까지 모든 것을 다뤄보겠습니다.

## 📋 목차

1. [Cassandra 동작 원리](#cassandra-동작-원리)
2. [키스페이스와 데이터 모델](#키스페이스와-데이터-모델)
3. [클러스터 구성과 링 구조](#클러스터-구성과-링-구조)
4. [복제와 가용성](#복제와-가용성)
5. [일관성 레벨](#일관성-레벨)
6. [개발 도구와 GUI](#개발-도구와-gui)
7. [ScyllaDB 비교](#scylladb-비교)
8. [트랜잭션과 조인 제약사항](#트랜잭션과-조인-제약사항)
9. [실무 팁과 권장사항](#실무-팁과-권장사항)

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