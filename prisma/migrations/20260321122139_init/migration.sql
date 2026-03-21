-- CreateTable
CREATE TABLE "GameUpdate" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "releaseDate" DATE,
    "description" TEXT,

    CONSTRAINT "GameUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatchNote" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "gameUpdateId" INTEGER NOT NULL,
    "patchName" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "revision" TEXT,
    "date" TEXT NOT NULL,
    "dateIso" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "keywords" TEXT[],

    CONSTRAINT "PatchNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Section" (
    "id" SERIAL NOT NULL,
    "patchNoteId" INTEGER NOT NULL,
    "heading" TEXT NOT NULL,
    "description" TEXT,
    "items" TEXT[],
    "searchText" TEXT NOT NULL,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subsection" (
    "id" SERIAL NOT NULL,
    "sectionId" INTEGER NOT NULL,
    "heading" TEXT NOT NULL,
    "searchText" TEXT NOT NULL,

    CONSTRAINT "Subsection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Change" (
    "id" SERIAL NOT NULL,
    "sectionId" INTEGER,
    "subsectionId" INTEGER,
    "ability" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "notes" TEXT[],
    "searchText" TEXT NOT NULL,
    "gameUpdateId" INTEGER NOT NULL,
    "gameUpdateName" TEXT NOT NULL,
    "patchSlug" TEXT NOT NULL,
    "patchVersion" TEXT NOT NULL,
    "patchDate" DATE NOT NULL,
    "sectionHeading" TEXT NOT NULL,
    "subsectionHeading" TEXT,

    CONSTRAINT "Change_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stat" (
    "id" SERIAL NOT NULL,
    "changeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,

    CONSTRAINT "Stat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GameUpdate_slug_key" ON "GameUpdate"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "GameUpdate_name_key" ON "GameUpdate"("name");

-- CreateIndex
CREATE INDEX "GameUpdate_slug_idx" ON "GameUpdate"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "PatchNote_slug_key" ON "PatchNote"("slug");

-- CreateIndex
CREATE INDEX "PatchNote_gameUpdateId_idx" ON "PatchNote"("gameUpdateId");

-- CreateIndex
CREATE INDEX "PatchNote_dateIso_idx" ON "PatchNote"("dateIso");

-- CreateIndex
CREATE INDEX "PatchNote_slug_idx" ON "PatchNote"("slug");

-- CreateIndex
CREATE INDEX "Section_patchNoteId_idx" ON "Section"("patchNoteId");

-- CreateIndex
CREATE INDEX "Section_heading_idx" ON "Section"("heading");

-- CreateIndex
CREATE INDEX "Subsection_sectionId_idx" ON "Subsection"("sectionId");

-- CreateIndex
CREATE INDEX "Subsection_heading_idx" ON "Subsection"("heading");

-- CreateIndex
CREATE INDEX "Change_gameUpdateId_idx" ON "Change"("gameUpdateId");

-- CreateIndex
CREATE INDEX "Change_patchSlug_idx" ON "Change"("patchSlug");

-- CreateIndex
CREATE INDEX "Change_patchDate_idx" ON "Change"("patchDate");

-- CreateIndex
CREATE INDEX "Change_sectionHeading_idx" ON "Change"("sectionHeading");

-- CreateIndex
CREATE INDEX "Change_subsectionHeading_idx" ON "Change"("subsectionHeading");

-- CreateIndex
CREATE INDEX "Stat_changeId_idx" ON "Stat"("changeId");

-- CreateIndex
CREATE INDEX "Stat_name_idx" ON "Stat"("name");

-- AddForeignKey
ALTER TABLE "PatchNote" ADD CONSTRAINT "PatchNote_gameUpdateId_fkey" FOREIGN KEY ("gameUpdateId") REFERENCES "GameUpdate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_patchNoteId_fkey" FOREIGN KEY ("patchNoteId") REFERENCES "PatchNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subsection" ADD CONSTRAINT "Subsection_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Change" ADD CONSTRAINT "Change_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Change" ADD CONSTRAINT "Change_subsectionId_fkey" FOREIGN KEY ("subsectionId") REFERENCES "Subsection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stat" ADD CONSTRAINT "Stat_changeId_fkey" FOREIGN KEY ("changeId") REFERENCES "Change"("id") ON DELETE CASCADE ON UPDATE CASCADE;
