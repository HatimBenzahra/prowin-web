-- Journal des écoutes (page Coachings) : fenêtres par date sur les segments. Migration additive.

-- CreateIndex
CREATE INDEX "RecordingSegment_createdAt_idx" ON "RecordingSegment"("createdAt");
