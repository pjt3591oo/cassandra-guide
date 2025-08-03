# Cassandra CRUD Test

Cassandra 데이터베이스를 Docker Compose로 실행하고 JavaScript로 CRUD 작업을 테스트하는 프로젝트입니다.

[detail document](./cassandra_complete_guide.md)

## 구성 옵션

### 1. 단일 노드 (개발/테스트용)
```bash
docker-compose up -d
npm install
npm run setup
npm test
```

### 2. 3-노드 클러스터 (권장)
```bash
docker-compose -f docker-compose-cluster.yml up -d
npm install
npm run setup-cluster
npm run test-cluster
```

### 3. Multi-DC 구성 (고급)
```bash
docker-compose -f docker-compose-multi-dc.yml up -d
npm install
npm run setup-multi-dc
```

## 주요 기능

### 단일 노드
- 빠른 개발 환경 구성
- 기본 CRUD 테스트

### 3-노드 클러스터
- Replication Factor 3
- Consistency Level 테스트
- 노드 장애 시뮬레이션
- 부하 분산 확인

### Multi-DC
- 2개 데이터센터 (us-east, eu-west)
- 각 DC당 2개 노드
- 지역별 복제 전략

## Cassandra 접속 방법

### 1. 명령줄 (cqlsh)
```bash
# 단일 노드
docker exec -it cassandra-db cqlsh

# 클러스터
docker exec -it cassandra-node1 cqlsh
```

### 2. GUI 도구 옵션
- **TablePlus** (추천): 모던한 상용 DB 클라이언트
  - 연결: localhost:9042
- **DBeaver**: 무료 오픈소스 DB 도구
  - Cassandra 드라이버 설치 필요
- **DataStax Studio**: 무료 Cassandra 전용 IDE
  - https://downloads.datastax.com/
- **DataGrip**: JetBrains의 전문 DB IDE

## 파일 설명

- `docker-compose.yml`: 단일 노드 Cassandra
- `docker-compose-cluster.yml`: 3-노드 클러스터
- `docker-compose-multi-dc.yml`: Multi-DC 구성
- `test-crud.js`: 기본 CRUD 테스트
- `test-cluster-crud.js`: Consistency Level 및 장애 테스트
- `setup-*.js`: 각 구성별 초기 설정

## 종료 방법
```bash
# 단일 노드
docker-compose down -v

# 클러스터
docker-compose -f docker-compose-cluster.yml down -v

# Multi-DC
docker-compose -f docker-compose-multi-dc.yml down -v
```