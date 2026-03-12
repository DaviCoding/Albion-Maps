-- CreateTable
CREATE TABLE "GameUpdate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "thumbnail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Changelog" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "gameUpdateId" TEXT NOT NULL,

    CONSTRAINT "Changelog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangelogContent" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "version" TEXT,
    "date" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "changelogId" TEXT NOT NULL,

    CONSTRAINT "ChangelogContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "contentId" TEXT NOT NULL,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SectionItem" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "children" TEXT[],
    "order" INTEGER NOT NULL,
    "sectionId" TEXT NOT NULL,

    CONSTRAINT "SectionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryBlock" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL,
    "sectionId" TEXT NOT NULL,

    CONSTRAINT "CategoryBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryChange" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "children" TEXT[],
    "order" INTEGER NOT NULL,
    "categoryBlockId" TEXT NOT NULL,

    CONSTRAINT "CategoryChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GameUpdate_slug_key" ON "GameUpdate"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Changelog_slug_key" ON "Changelog"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ChangelogContent_changelogId_key" ON "ChangelogContent"("changelogId");

-- AddForeignKey
ALTER TABLE "Changelog" ADD CONSTRAINT "Changelog_gameUpdateId_fkey" FOREIGN KEY ("gameUpdateId") REFERENCES "GameUpdate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangelogContent" ADD CONSTRAINT "ChangelogContent_changelogId_fkey" FOREIGN KEY ("changelogId") REFERENCES "Changelog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ChangelogContent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SectionItem" ADD CONSTRAINT "SectionItem_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryBlock" ADD CONSTRAINT "CategoryBlock_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryChange" ADD CONSTRAINT "CategoryChange_categoryBlockId_fkey" FOREIGN KEY ("categoryBlockId") REFERENCES "CategoryBlock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
