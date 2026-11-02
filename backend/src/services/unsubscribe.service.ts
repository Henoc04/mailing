import { prisma } from "../lib/prisma";

export interface UnsubscribeTarget {
  contactId: string;
  email: string;
  isUnsubscribed: boolean;
}

/** Resolves an email's per-recipient token to the contact it was sent to. */
export async function findByToken(token: string): Promise<UnsubscribeTarget | null> {
  const recipient = await prisma.campaignRecipient.findUnique({
    where: { trackingToken: token },
    select: { contact: { select: { id: true, email: true, isUnsubscribed: true } } },
  });
  if (!recipient) {
    return null;
  }
  return {
    contactId: recipient.contact.id,
    email: recipient.contact.email,
    isUnsubscribed: recipient.contact.isUnsubscribed,
  };
}

/** Idempotent: unsubscribing twice keeps the original timestamp. */
export async function unsubscribe(contactId: string): Promise<void> {
  await prisma.contact.updateMany({
    where: { id: contactId, isUnsubscribed: false },
    data: { isUnsubscribed: true, unsubscribedAt: new Date() },
  });
}

/** "jean.dupont@exemple.fr" -> "j***@exemple.fr" — confirms the address without fully exposing it. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) {
    return "***";
  }
  return `${local.charAt(0)}***@${domain}`;
}
