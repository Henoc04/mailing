import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as contactsApi from "../../../api/contacts.api";
import type { ContactWithTags } from "../../../api/types";

// -----------------------------------------------------------------------
// Debounced searchable contact picker — reused for Step 2 (SINGLE target)
// and Step 5 (preview), each with its own independent search/selection.
// -----------------------------------------------------------------------
interface ContactPickerProps {
  selectedContactId: string;
  onSelect: (contact: ContactWithTags) => void;
}

export function ContactPicker({ selectedContactId, onSelect }: ContactPickerProps) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ["contacts", "picker", debouncedSearch],
    queryFn: () => contactsApi.list({ search: debouncedSearch || undefined, pageSize: 10 }),
  });

  const contacts = data?.items ?? [];

  return (
    <div className="space-y-2">
      <input
        className="input"
        placeholder="Rechercher un contact (nom, email...)"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="max-h-48 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-700">
        {isLoading ? (
          <p className="p-3 text-sm text-gray-500 dark:text-gray-400">Recherche...</p>
        ) : contacts.length === 0 ? (
          <p className="p-3 text-sm text-gray-500 dark:text-gray-400">Aucun contact trouvé.</p>
        ) : (
          contacts.map((contact) => (
            <button
              type="button"
              key={contact.id}
              onClick={() => onSelect(contact)}
              className={`flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                selectedContactId === contact.id ? "bg-brand-50 dark:bg-brand-900/30" : ""
              }`}
            >
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {contact.prenom} {contact.nom}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">{contact.email}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
