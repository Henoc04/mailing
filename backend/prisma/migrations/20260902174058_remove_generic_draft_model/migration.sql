/*
  Warnings:

  - You are about to drop the `Draft` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `Draft` DROP FOREIGN KEY `Draft_ownerId_fkey`;

-- DropTable
DROP TABLE `Draft`;
