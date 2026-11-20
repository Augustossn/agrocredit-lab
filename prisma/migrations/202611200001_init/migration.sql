CREATE TYPE "Role" AS ENUM ('APPLICANT','ANALYST');
CREATE TYPE "Status" AS ENUM ('DRAFT','SUBMITTED','ANALYZING','APPROVED','REJECTED');
CREATE TABLE "User" ("id" TEXT PRIMARY KEY,"email" TEXT NOT NULL UNIQUE,"name" TEXT NOT NULL,"passwordHash" TEXT NOT NULL,"role" "Role" NOT NULL);
CREATE TABLE "Session" ("id" TEXT PRIMARY KEY,"userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,"expiresAt" TIMESTAMP(3) NOT NULL);
CREATE TABLE "Producer" ("id" TEXT PRIMARY KEY,"name" TEXT NOT NULL,"syntheticCode" TEXT NOT NULL UNIQUE,"ownerId" TEXT NOT NULL REFERENCES "User"("id"));
CREATE TABLE "Property" ("id" TEXT PRIMARY KEY,"name" TEXT NOT NULL,"city" TEXT NOT NULL,"hectares" DECIMAL(12,2) NOT NULL CHECK ("hectares">0),"producerId" TEXT NOT NULL REFERENCES "Producer"("id"));
CREATE TABLE "CreditRequest" ("id" TEXT PRIMARY KEY,"propertyId" TEXT NOT NULL REFERENCES "Property"("id"),"amount" DECIMAL(16,2) NOT NULL CHECK ("amount">0),"purpose" TEXT NOT NULL,"months" INTEGER NOT NULL CHECK ("months" BETWEEN 1 AND 120),"revenue" DECIMAL(16,2) NOT NULL CHECK ("revenue">=0),"costs" DECIMAL(16,2) NOT NULL CHECK ("costs">=0),"debt" DECIMAL(16,2) NOT NULL CHECK ("debt">=0),"status" "Status" NOT NULL DEFAULT 'DRAFT',"recommendation" JSONB,"justification" TEXT,"version" INTEGER NOT NULL DEFAULT 0,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
CONSTRAINT "decision_requires_reason" CHECK ("status" NOT IN ('APPROVED','REJECTED') OR length(trim("justification"))>=10 AND "justification" IS NOT NULL));
CREATE TABLE "Audit" ("id" TEXT PRIMARY KEY,"requestId" TEXT NOT NULL REFERENCES "CreditRequest"("id"),"actorId" TEXT NOT NULL,"action" TEXT NOT NULL,"change" JSONB NOT NULL,"correlationId" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "Document" ("id" TEXT PRIMARY KEY,"requestId" TEXT NOT NULL REFERENCES "CreditRequest"("id"),"key" TEXT NOT NULL UNIQUE,"name" TEXT NOT NULL,"mime" TEXT NOT NULL,"size" INTEGER NOT NULL CHECK ("size">0 AND "size"<=5242880),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "AnalysisEvent" ("id" TEXT PRIMARY KEY,"requestId" TEXT NOT NULL REFERENCES "CreditRequest"("id"),"correlationId" TEXT NOT NULL,"dispatchedAt" TIMESTAMP(3),"processedAt" TIMESTAMP(3),"deadAt" TIMESTAMP(3),"attempts" INTEGER NOT NULL DEFAULT 0,"replays" INTEGER NOT NULL DEFAULT 0,"lastError" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "Attempt" ("id" TEXT PRIMARY KEY,"eventId" TEXT NOT NULL REFERENCES "AnalysisEvent"("id"),"number" INTEGER NOT NULL,"success" BOOLEAN NOT NULL,"error" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "Heartbeat" ("id" TEXT PRIMARY KEY,"at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "CreditRequest_status_createdAt_idx" ON "CreditRequest"("status","createdAt");
CREATE INDEX "Audit_requestId_createdAt_idx" ON "Audit"("requestId","createdAt");
CREATE INDEX "AnalysisEvent_dispatchedAt_processedAt_idx" ON "AnalysisEvent"("dispatchedAt","processedAt");
