-- AlterTable
ALTER TABLE `Attachment` ADD COLUMN `templateId` VARCHAR(191) NULL,
    MODIFY `campaignId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `Attachment_templateId_idx` ON `Attachment`(`templateId`);

-- AddForeignKey
ALTER TABLE `Attachment` ADD CONSTRAINT `Attachment_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `Template`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
