-- CreateTable
CREATE TABLE "claim_comments" (
    "id" TEXT NOT NULL,
    "claim_id" INTEGER NOT NULL,
    "author_address" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "claim_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "claim_comments_claim_id_deleted_at_created_at_idx" ON "claim_comments"("claim_id", "deleted_at", "created_at");

-- CreateIndex
CREATE INDEX "claim_comments_author_address_claim_id_idx" ON "claim_comments"("author_address", "claim_id");

-- AddForeignKey
ALTER TABLE "claim_comments" ADD CONSTRAINT "claim_comments_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;
