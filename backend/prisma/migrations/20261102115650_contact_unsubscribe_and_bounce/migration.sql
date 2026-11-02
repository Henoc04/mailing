-- AlterTable
ALTER TABLE `Contact` ADD COLUMN `bouncedAt` DATETIME(3) NULL,
    ADD COLUMN `unsubscribedAt` DATETIME(3) NULL;
