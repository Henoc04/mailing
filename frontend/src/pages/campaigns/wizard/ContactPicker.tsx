import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import * as contactsApi from "../../../api/contacts.api";
import type { ContactWithTags } from "../../../api/types";
import { Icon } from "../../../components/ui/Icon";
import { Spinner } from "../../../components/ui/Spinner";

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
      <div className="relative">
        <Icon
          name="search"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
        />
        <input
          type="search"
          className="input pl-9"
          placeholder="Rechercher un contact (nom, email…)"
          aria-label="Rechercher un contact"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        {isLoading ? (
          <p className="flex items-center gap-2 p-3 text-sm text-gray-500 dark:text-gray-400">
            <Spinner className="h-4 w-4 text-brand-500" />
            Recherche…
          </p>
        ) : contacts.length === 0 ? (
          <p className="p-3 text-sm text-gray-500 dark:text-gray-400">Aucun contact trouvé.</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {contacts.map((contact) => {
              const selected = selectedContactId === contact.id;
              return (
                <li key={contact.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(contact)}
                    aria-pressed={selected}
                    className={clsx(
                      "flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors",
                      selected
                        ? "bg-brand-50 dark:bg-brand-500/10"
                        : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-gray-900 dark:text-gray-100">
                        {contact.prenom} {contact.nom}
                      </span>
                      <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{contact.email}</span>
                    </span>
                    {selected && <Icon name="checkCircle" className="h-5 w-5 shrink-0 text-brand-600 dark:text-brand-400" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
