import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import * as campaignsApi from "../../../api/campaigns.api";
import { Button } from "../../../components/ui/Button";
import { Icon } from "../../../components/ui/Icon";
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
    <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50/60 p-4 dark:border-gray-800 dark:bg-gray-800/30">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
          <Icon name="mail" className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Envoyer un email de test</p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Recevez la campagne telle que vos destinataires la verront (objet préfixé par [TEST]). Rien n'est
            comptabilisé dans les statistiques.
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          className="input sm:max-w-xs"
          placeholder="votre@email.fr"
          aria-label="Adresse de réception du test"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button
          type="button"
          variant="secondary"
          className="w-full sm:w-auto"
          disabled={!email.trim()}
          loading={testMutation.isPending}
          onClick={() => testMutation.mutate()}
        >
          {!testMutation.isPending && <Icon name="send" className="h-4 w-4" />}
          Envoyer le test
        </Button>
      </div>
    </div>
  );
}
