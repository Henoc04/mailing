import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import * as campaignsApi from "../../../api/campaigns.api";
import { Button } from "../../../components/ui/Button";
import { useToast } from "../../../components/ui/ToastProvider";
import { useAuth } from "../../../context/AuthContext";
import { extractErrorMessage } from "./wizardForm";

interface TestSendPanelProps {
  campaignId: string;
  /** Contact whose data fills the merge variables (the one shown in the preview). */
  contactId?: string;
}

/**
 * Sends the campaign as recipients will receive it to one address, without
 * recording anything — the reliable way to check rendering in a real inbox
 * (Gmail/Outlook display differs from the in-app preview).
 */
export function TestSendPanel({ campaignId, contactId }: Readonly<TestSendPanelProps>) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [email, setEmail] = useState(user?.email ?? "");

  const testMutation = useMutation({
    mutationFn: () => campaignsApi.testSend(campaignId, { email: email.trim(), contactId }),
    onSuccess: (result) => showToast(`Email de test envoyé à ${result.sentTo}`, "success"),
    onError: (error) => showToast(extractErrorMessage(error, "Impossible d'envoyer l'email de test"), "error"),
  });

  return (
    <div className="space-y-2 rounded-md border border-gray-200 p-4 dark:border-gray-700">
      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Envoyer un email de test</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Recevez la campagne telle que vos destinataires la verront (objet préfixé par [TEST]). Rien n'est
        comptabilisé dans les statistiques.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          type="email"
          className="input max-w-xs"
          placeholder="votre@email.fr"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button
          variant="secondary"
          disabled={!email.trim() || testMutation.isPending}
          onClick={() => testMutation.mutate()}
        >
          {testMutation.isPending ? "Envoi..." : "Envoyer le test"}
        </Button>
      </div>
    </div>
  );
}
