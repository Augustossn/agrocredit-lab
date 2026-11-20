\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() <> 'agrocredit_test' OR inet_server_port() <> 55433 THEN RAISE EXCEPTION 'Ambiente de teste isolado obrigatório'; END IF;
  IF 0.10::numeric + 0.20::numeric <> 0.30::numeric THEN RAISE EXCEPTION 'Erro decimal'; END IF;
END $$;
INSERT INTO "User" VALUES ('sql-contract-user','sql-contract@agrolab.test','Fictício','not-a-login-hash','APPLICANT');
INSERT INTO "Producer" VALUES ('sql-contract-producer','Produtor de teste','SYN-SQL-CONTRACT','sql-contract-user');
INSERT INTO "Property" VALUES ('sql-contract-property','Propriedade sintética','Cidade fictícia',100.00,'sql-contract-producer');
INSERT INTO "CreditRequest"("id","propertyId","amount","purpose","months","revenue","costs","debt","updatedAt") VALUES ('sql-contract-request','sql-contract-property',99999999999999.99,'Contrato SQL',36,240000.10,100000.00,0.00,CURRENT_TIMESTAMP);
DO $$ BEGIN
  IF (SELECT "amount"::text FROM "CreditRequest" WHERE id='sql-contract-request') <> '99999999999999.99' THEN RAISE EXCEPTION 'Precisão perdida'; END IF;
  BEGIN
    UPDATE "CreditRequest" SET status='APPROVED' WHERE id='sql-contract-request';
    RAISE EXCEPTION 'Justificativa deveria ser obrigatória';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE "CreditRequest" SET amount=-1 WHERE id='sql-contract-request';
    RAISE EXCEPTION 'Valor negativo deveria ser recusado';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
SAVEPOINT atomic;
INSERT INTO "AnalysisEvent"("id","requestId","correlationId") VALUES ('sql-contract-event','sql-contract-request','sql-contract-cid');
ROLLBACK TO SAVEPOINT atomic;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM "AnalysisEvent" WHERE id='sql-contract-event') THEN RAISE EXCEPTION 'Rollback falhou'; END IF;
END $$;
ROLLBACK;
SELECT 'Contrato SQL: precisão, constraints, referências e rollback verificados' AS result;
