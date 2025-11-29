import { useState, useEffect } from "react";
import {
  Send,
  Plus,
  Trash2,
  Eye,
  X,
  CheckCircle,
  XCircle,
  Clock,
  Upload,
  Edit2,
  FolderOpen,
  ChevronDown,
  Users,
} from "lucide-react";
import {
  supabase,
  Mailing,
  Contact,
  Email,
  ContactGroup,
} from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { MailingsPingPage } from "./MailingsPingPage";

interface GroupWithSubgroupsProps {
  group: ContactGroup;
  isSelected: boolean;
  isExpanded: boolean;
  emails: Email[];
  selectedSubgroups: string[];
  selectedContacts: string[];
  subgroupEmailOverrides: Record<string, string>;
  expandedSubgroups: Set<string>;
  onToggle: () => void;
  onCheckChange: (checked: boolean) => void;
  onSubgroupCheck: (subgroupId: string, checked: boolean) => void;
  onContactCheck: (contactId: string, checked: boolean) => void;
  onSubgroupToggle: (subgroupId: string) => void;
  onEmailOverride: (subgroupId: string, emailId: string) => void;
}

function GroupWithSubgroups({
  group,
  isSelected,
  isExpanded,
  emails,
  selectedSubgroups,
  selectedContacts,
  subgroupEmailOverrides,
  expandedSubgroups,
  onToggle,
  onCheckChange,
  onSubgroupCheck,
  onContactCheck,
  onSubgroupToggle,
  onEmailOverride,
}: GroupWithSubgroupsProps) {
  const [subgroups, setSubgroups] = useState<ContactGroup[]>([]);
  const [loadingSubgroups, setLoadingSubgroups] = useState(false);
  const [subgroupContacts, setSubgroupContacts] = useState<Record<string, Contact[]>>({});
  const [loadingContacts, setLoadingContacts] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (isExpanded && subgroups.length === 0) {
      loadSubgroups();
    }
  }, [isExpanded]);

  const loadSubgroups = async () => {
    setLoadingSubgroups(true);
    const { data } = await supabase
      .from("contact_groups")
      .select("*")
      .eq("parent_group_id", group.id)
      .order("name", { ascending: true });

    if (data) {
      setSubgroups(data);
    }
    setLoadingSubgroups(false);
  };

  const loadSubgroupContacts = async (subgroupId: string) => {
    if (subgroupContacts[subgroupId]) return;

    setLoadingContacts({ ...loadingContacts, [subgroupId]: true });

    const { data: members } = await supabase
      .from("contact_group_members")
      .select("contact_id")
      .eq("group_id", subgroupId);

    if (members && members.length > 0) {
      const contactIds = members.map(m => m.contact_id);
      const { data: contacts } = await supabase
        .from("contacts")
        .select("*")
        .in("id", contactIds)
        .order("email", { ascending: true });

      if (contacts) {
        setSubgroupContacts({ ...subgroupContacts, [subgroupId]: contacts });
      }
    } else {
      setSubgroupContacts({ ...subgroupContacts, [subgroupId]: [] });
    }

    setLoadingContacts({ ...loadingContacts, [subgroupId]: false });
  };

  useEffect(() => {
    expandedSubgroups.forEach(subgroupId => {
      if (subgroups.find(s => s.id === subgroupId)) {
        loadSubgroupContacts(subgroupId);
      }
    });
  }, [expandedSubgroups, subgroups]);

  return (
    <div className="border border-gray-300 dark:border-gray-600 rounded-lg">
      <div className="p-4 bg-gray-50 dark:bg-gray-700/50 flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => onCheckChange(e.target.checked)}
            className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={onToggle}
            className="flex items-center gap-2 text-left flex-1"
          >
            <ChevronDown
              className={`w-5 h-5 text-gray-600 dark:text-gray-400 transition-transform ${
                isExpanded ? "" : "-rotate-90"
              }`}
            />
            <FolderOpen className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span className="font-medium text-gray-900 dark:text-white">
              {group.name}
            </span>
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-gray-300 dark:border-gray-600 p-4 space-y-2 bg-white dark:bg-gray-800">
          {loadingSubgroups ? (
            <div className="flex items-center justify-center py-4">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : subgroups.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-2">
              Нет подгрупп
            </p>
          ) : (
            subgroups.map((subgroup) => {
              const isSubgroupExpanded = expandedSubgroups.has(subgroup.id);
              const contacts = subgroupContacts[subgroup.id] || [];
              const isLoadingContacts = loadingContacts[subgroup.id];

              return (
                <div
                  key={subgroup.id}
                  className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden"
                >
                  <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/30">
                    <input
                      type="checkbox"
                      checked={selectedSubgroups.includes(subgroup.id)}
                      onChange={(e) => onSubgroupCheck(subgroup.id, e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 flex-shrink-0"
                    />
                    <button
                      type="button"
                      onClick={() => onSubgroupToggle(subgroup.id)}
                      className="flex items-center gap-2 text-left flex-1"
                    >
                      <ChevronDown
                        className={`w-4 h-4 text-gray-600 dark:text-gray-400 transition-transform ${
                          isSubgroupExpanded ? "" : "-rotate-90"
                        }`}
                      />
                      <FolderOpen className="w-4 h-4 text-green-600 dark:text-green-400" />
                      <span className="text-sm text-gray-900 dark:text-white">
                        {subgroup.name}
                      </span>
                    </button>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                        Почта:
                      </label>
                      <select
                        value={subgroupEmailOverrides[subgroup.id] || ""}
                        onChange={(e) => onEmailOverride(subgroup.id, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="px-2 py-1 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white min-w-[180px]"
                      >
                        <option value="">По умолчанию</option>
                        {emails.map((email) => (
                          <option key={email.id} value={email.id}>
                            {email.email}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {isSubgroupExpanded && (
                    <div className="border-t border-gray-200 dark:border-gray-600 p-3 bg-white dark:bg-gray-800">
                      {isLoadingContacts ? (
                        <div className="flex items-center justify-center py-4">
                          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                        </div>
                      ) : contacts.length === 0 ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-2">
                          Нет контактов в подгруппе
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {contacts.map((contact) => (
                            <label
                              key={contact.id}
                              className="flex items-center gap-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-700/30 rounded cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={selectedContacts.includes(contact.id)}
                                onChange={(e) => onContactCheck(contact.id, e.target.checked)}
                                className="w-3.5 h-3.5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 flex-shrink-0"
                              />
                              <Users className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                              <span className="text-xs text-gray-700 dark:text-gray-300 flex-1">
                                {contact.email}
                                {contact.name && (
                                  <span className="text-gray-500 dark:text-gray-400 ml-1">
                                    ({contact.name})
                                  </span>
                                )}
                              </span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

interface MailingRecipient {
  id: string;
  mailing_id: string;
  contact_id: string;
  sender_email_id: string;
  status: string;
  sent_at: string | null;
  error_message: string | null;
  contact?: Contact;
  sender_email?: Email;
}

interface MailingWithRecipients extends Mailing {
  recipients?: MailingRecipient[];
}

const TIMEZONES = [
  { label: "ET", iana: "America/New_York" },
  { label: "CT", iana: "America/Chicago" },
  { label: "MT", iana: "America/Denver" },
  { label: "PT", iana: "America/Los_Angeles" },
  { label: "GMT", iana: "Etc/GMT" },
  { label: "UTC", iana: "Etc/UTC" },
  { label: "CET", iana: "Europe/Berlin" },
  { label: "EET", iana: "Europe/Helsinki" },
  { label: "MSK", iana: "Europe/Moscow" },
  { label: "IST", iana: "Asia/Kolkata" },
  { label: "CST", iana: "Asia/Shanghai" },
  { label: "HKT", iana: "Asia/Hong_Kong" },
  { label: "JST", iana: "Asia/Tokyo" },
  { label: "KST", iana: "Asia/Seoul" },
];

export function MailingsPage() {
  const { user } = useAuth();
  const [mailings, setMailings] = useState<MailingWithRecipients[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedMailing, setSelectedMailing] =
    useState<MailingWithRecipients | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDuplicatesModal, setShowDuplicatesModal] = useState(false);
  const [mailingToEdit, setMailingToEdit] =
    useState<MailingWithRecipients | null>(null);
  const [mailingToDelete, setMailingToDelete] = useState<Mailing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<
    "pending" | "sent" | "failed" | "ping"
  >("pending");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [selectedSubgroups, setSelectedSubgroups] = useState<string[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [expandedSubgroups, setExpandedSubgroups] = useState<Set<string>>(new Set());
  const [duplicateMailings, setDuplicateMailings] = useState<
    Array<{
      contact_email: string;
      contact_name: string;
      contact_id: string;
      mailings: Array<{
        sent_at: string;
        sender_email: string;
        subject: string;
      }>;
    }>
  >([]);
  const [expandedDuplicates, setExpandedDuplicates] = useState<Set<string>>(new Set());

  const [newMailing, setNewMailing] = useState({
    subject: "",
    text_content: "",
    html_content: "",
    scheduled_at: "",
    scheduled_time: "",
    timezone: "UTC",
    selected_contacts: [] as string[],
    selected_groups: [] as string[],
    exclude_contacts: [] as string[],
    send_now: false,
    subgroup_email_overrides: {} as Record<string, string>,
  });

  useEffect(() => {
    if (!user) return;

    loadMailings();
    loadContacts();
    loadGroups();
    loadEmails();

    // Подписка только на таблицу mailings для получения уведомлений о создании/изменении
    const mailingsChannel = supabase
      .channel("mailings-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "mailings",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          loadMailings();
        }
      )
      .subscribe();

    // Умная проверка статусов рассылок каждые 2 секунды
    // Запускается только когда есть активные рассылки в статусе "sending"
    const checkInterval = setInterval(async () => {
      // Проверяем напрямую в базе, есть ли рассылки в статусе "sending"
      const { data: sendingMailings } = await supabase
        .from("mailings")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "sending")
        .limit(1);

      // Только если есть активные рассылки - загружаем данные
      if (sendingMailings && sendingMailings.length > 0) {
        loadMailings();
      }
    }, 3000); // 2 секунды

    return () => {
      mailingsChannel.unsubscribe();
      clearInterval(checkInterval);
    };
  }, [user]);

  const loadMailings = async () => {
    if (!user) return;

    // Возьмём mailings вместе с mailing_recipients + контактами и sender_email в одном запросе
    const { data: mailingsData, error } = await supabase
      .from("mailings")
      .select(
        `
      *,
      mailing_recipients(
        id,
        mailing_id,
        contact_id,
        sender_email_id,
        status,
        sent_at,
        error_message,
        contact:contacts(*),
        sender_email:emails(*)
      )
    `
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("loadMailings error:", error);
      return;
    }

    if (mailingsData) {
      // приводим в тот же формат, который использует остальной UI (recipients -> recipients)
      const normalized = mailingsData.map((m: any) => ({
        ...m,
        // Supabase вернёт ключ "mailing_recipients", приводим к mailing.recipients
        recipients: m.mailing_recipients ?? [],
      }));

      // Проверяем и обновляем статусы рассылок, которые в статусе "sending"
      for (const mailing of normalized) {
        if (mailing.status === "sending") {
          const totalRecipients = mailing.recipients?.length || 0;
          const processedCount = mailing.success_count + mailing.failed_count;

          // Если все получатели обработаны (sent_count равен количеству получателей)
          // И сумма success + failed совпадает с sent_count
          if (
            mailing.sent_count >= totalRecipients &&
            processedCount >= totalRecipients &&
            totalRecipients > 0
          ) {
            // Определяем финальный статус
            const finalStatus = mailing.success_count > 0 ? "completed" : "failed";

            // Обновляем статус в базе данных
            await supabase
              .from("mailings")
              .update({ status: finalStatus })
              .eq("id", mailing.id);

            // Обновляем локально
            mailing.status = finalStatus;
          }
        }
      }

      setMailings(normalized);
    }
  };

  const loadContacts = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("contacts")
      .select("*")
      .eq("owner_id", user.id)
      .order("email", { ascending: true });

    if (data) {
      setContacts(data);
    }
  };

  const loadGroups = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("contact_groups")
      .select("*")
      .eq("user_id", user.id)
      .is("parent_group_id", null)
      .order("name", { ascending: true });

    if (data) {
      setGroups(data);
    }
  };

  const loadEmails = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("emails")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active");

    if (data) {
      setEmails(data);
    }
  };

  const checkForDuplicateMailings = async (contactIds: string[]) => {
    if (contactIds.length === 0) return [];

    const { data: existingRecipients } = await supabase
      .from("mailing_recipients")
      .select(
        `
        id,
        contact_id,
        sent_at,
        mailing_id,
        contact:contacts(id, email, name),
        sender_email:emails(email),
        mailing:mailings(subject)
      `
      )
      .in("contact_id", contactIds)
      .eq("status", "sent");

    if (!existingRecipients || existingRecipients.length === 0) {
      return [];
    }

    // Группируем рассылки по контактам
    const contactMap = new Map<string, {
      contact_email: string;
      contact_name: string;
      contact_id: string;
      mailings: Array<{
        sent_at: string;
        sender_email: string;
        subject: string;
      }>;
    }>();

    existingRecipients.forEach((recipient: any) => {
      const contactId = recipient.contact_id;
      const contactEmail = recipient.contact?.email || "";
      const contactName = recipient.contact?.name || "";

      if (!contactMap.has(contactId)) {
        contactMap.set(contactId, {
          contact_email: contactEmail,
          contact_name: contactName,
          contact_id: contactId,
          mailings: [],
        });
      }

      const contactData = contactMap.get(contactId)!;
      contactData.mailings.push({
        sent_at: recipient.sent_at || "",
        sender_email: recipient.sender_email?.email || "",
        subject: recipient.mailing?.subject || "Без темы",
      });
    });

    return Array.from(contactMap.values());
  };

  const handleCreateMailing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (
      selectedContacts.length === 0 &&
      newMailing.selected_groups.length === 0 &&
      selectedSubgroups.length === 0
    ) {
      setError("Выберите хотя бы одного получателя или группу");
      return;
    }

    setLoading(true);
    setError("");

    try {
      let allContactIds: string[] = [];

      // Если выбраны группы - собираем контакты из всех подгрупп
      for (const groupId of newMailing.selected_groups) {
        // Получаем все подгруппы этой группы
        const { data: subgroups } = await supabase
          .from("contact_groups")
          .select("id")
          .eq("parent_group_id", groupId);

        if (subgroups && subgroups.length > 0) {
          // Собираем контакты из всех подгрупп
          for (const subgroup of subgroups) {
            const { data: subgroupMembers } = await supabase
              .from("contact_group_members")
              .select("contact_id")
              .eq("group_id", subgroup.id);

            if (subgroupMembers) {
              allContactIds.push(...subgroupMembers.map((m) => m.contact_id));
            }
          }
        }
      }

      // Если выбраны подгруппы - добавляем их контакты
      for (const subgroupId of selectedSubgroups) {
        const { data: subgroupMembers } = await supabase
          .from("contact_group_members")
          .select("contact_id")
          .eq("group_id", subgroupId);

        if (subgroupMembers) {
          allContactIds.push(...subgroupMembers.map((m) => m.contact_id));
        }
      }

      // Добавляем отдельные выбранные контакты
      allContactIds.push(...selectedContacts);

      // Убираем дубликаты
      allContactIds = [...new Set(allContactIds)];

      // Убираем исключенные контакты (те, с которых сняли галочки)
      const finalContacts = allContactIds.filter(
        (id) => !newMailing.exclude_contacts.includes(id)
      );

      if (finalContacts.length === 0) {
        setError("Нет контактов для отправки. Проверьте выбранные группы и контакты.");
        setLoading(false);
        return;
      }

      const duplicates = await checkForDuplicateMailings(finalContacts);

      if (duplicates.length > 0) {
        setDuplicateMailings(duplicates);
        setShowDuplicatesModal(true);
        setLoading(false);
        return;
      }

      await proceedWithMailingCreation();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Ошибка при создании рассылки"
      );
    } finally {
      setLoading(false);
    }
  };

  const proceedWithMailingCreation = async () => {
    if (!user) return;

    setLoading(true);
    setError("");

    try {
      let scheduledAt = null;
      if (
        !newMailing.send_now &&
        newMailing.scheduled_at &&
        newMailing.scheduled_time
      ) {
        const dateTime = `${newMailing.scheduled_at}T${newMailing.scheduled_time}:00`;
        scheduledAt = new Date(dateTime).toISOString();
      }

      // Собираем контакты для определения их подгрупп
      let allContactIds: string[] = [];

      // Если выбраны группы - собираем контакты из всех подгрупп
      for (const groupId of newMailing.selected_groups) {
        const { data: subgroups } = await supabase
          .from("contact_groups")
          .select("id")
          .eq("parent_group_id", groupId);

        if (subgroups && subgroups.length > 0) {
          for (const subgroup of subgroups) {
            const { data: subgroupMembers } = await supabase
              .from("contact_group_members")
              .select("contact_id")
              .eq("group_id", subgroup.id);

            if (subgroupMembers) {
              allContactIds.push(...subgroupMembers.map((m) => m.contact_id));
            }
          }
        }
      }

      // Если выбраны подгруппы - добавляем их контакты
      for (const subgroupId of selectedSubgroups) {
        const { data: subgroupMembers } = await supabase
          .from("contact_group_members")
          .select("contact_id")
          .eq("group_id", subgroupId);

        if (subgroupMembers) {
          allContactIds.push(...subgroupMembers.map((m) => m.contact_id));
        }
      }

      // Добавляем отдельные выбранные контакты
      allContactIds.push(...selectedContacts);

      // Убираем дубликаты
      allContactIds = [...new Set(allContactIds)];

      // Убираем исключенные контакты
      const finalContacts = allContactIds.filter(
        (id) => !newMailing.exclude_contacts.includes(id)
      );

      // Определяем подгруппы для каждого контакта и собираем уникальные подгруппы
      const contactSubgroupMap: Record<string, string[]> = {};
      const allSubgroupsUsed = new Set<string>();

      for (const contactId of finalContacts) {
        const { data: memberships } = await supabase
          .from("contact_group_members")
          .select("group_id")
          .eq("contact_id", contactId);

        if (memberships && memberships.length > 0) {
          contactSubgroupMap[contactId] = memberships.map(m => m.group_id);
          memberships.forEach(m => allSubgroupsUsed.add(m.group_id));
        }
      }

      // Загружаем данные всех используемых подгрупп
      const subgroupsData: Record<string, any> = {};
      if (allSubgroupsUsed.size > 0) {
        const { data: subgroupsList } = await supabase
          .from("contact_groups")
          .select("*")
          .in("id", Array.from(allSubgroupsUsed));

        if (subgroupsList) {
          subgroupsList.forEach(sg => {
            subgroupsData[sg.id] = sg;
          });
        }
      }

      // Выбираем контент для рассылки
      // Приоритет: если выбраны подгруппы - берем из первой, иначе из первой подгруппы группы, иначе из контактов
      let mailingSubject = "";
      let mailingTextContent = null;
      let mailingHtmlContent = null;

      if (selectedSubgroups.length > 0) {
        // Берем контент из первой выбранной подгруппы
        const firstSubgroupData = subgroupsData[selectedSubgroups[0]];
        if (firstSubgroupData) {
          mailingSubject = firstSubgroupData.default_subject || "";
          mailingTextContent = firstSubgroupData.default_text_content || null;
          mailingHtmlContent = firstSubgroupData.default_html_content || null;
        }
      } else if (newMailing.selected_groups.length > 0) {
        // Берем из первой подгруппы выбранной группы
        const { data: firstGroupSubgroups } = await supabase
          .from("contact_groups")
          .select("*")
          .eq("parent_group_id", newMailing.selected_groups[0])
          .limit(1);

        if (firstGroupSubgroups && firstGroupSubgroups.length > 0) {
          const subgroup = firstGroupSubgroups[0];
          mailingSubject = subgroup.default_subject || "";
          mailingTextContent = subgroup.default_text_content || null;
          mailingHtmlContent = subgroup.default_html_content || null;
        }
      } else if (finalContacts.length > 0) {
        // Если выбраны только контакты без подгрупп, берем контент из подгруппы первого контакта
        const firstContactId = finalContacts[0];
        const subgroupIds = contactSubgroupMap[firstContactId];
        if (subgroupIds && subgroupIds.length > 0) {
          const firstSubgroupData = subgroupsData[subgroupIds[0]];
          if (firstSubgroupData) {
            mailingSubject = firstSubgroupData.default_subject || "";
            mailingTextContent = firstSubgroupData.default_text_content || null;
            mailingHtmlContent = firstSubgroupData.default_html_content || null;
          }
        }
      }

      // finalContacts уже определены выше при загрузке контента

      const { data: mainMailing } = await supabase
        .from("mailings")
        .insert({
          user_id: user.id,
          subject: mailingSubject,
          text_content: mailingTextContent,
          html_content: mailingHtmlContent,
          scheduled_at: scheduledAt,
          timezone: newMailing.timezone,
          status: newMailing.send_now ? "sending" : "pending",
          sent_count: 0,
          success_count: 0,
          failed_count: 0,
        })
        .select()
        .single();

      if (!mainMailing) {
        throw new Error("Не удалось создать рассылку");
      }

      const recipientsToCreate = [];
      const groupEmailMap: Record<string, string> = {};

      // Собираем email overrides для всех подгрупп
      for (const groupId of newMailing.selected_groups) {
        const { data: subgroups } = await supabase
          .from("contact_groups")
          .select("id")
          .eq("parent_group_id", groupId);

        if (subgroups) {
          for (const subgroup of subgroups) {
            const emailOverride = newMailing.subgroup_email_overrides[subgroup.id];
            if (emailOverride) {
              groupEmailMap[subgroup.id] = emailOverride;
            }
          }
        }
      }

      // Добавляем overrides для явно выбранных подгрупп
      for (const subgroupId of selectedSubgroups) {
        const emailOverride = newMailing.subgroup_email_overrides[subgroupId];
        if (emailOverride) {
          groupEmailMap[subgroupId] = emailOverride;
        }
      }

      // Загружаем все подгруппы с их default_sender_email_id
      if (allSubgroupsUsed.size > 0) {
        const { data: subgroupsList } = await supabase
          .from("contact_groups")
          .select("id, default_sender_email_id")
          .in("id", Array.from(allSubgroupsUsed));

        if (subgroupsList) {
          subgroupsList.forEach(sg => {
            if (sg.default_sender_email_id && !groupEmailMap[sg.id]) {
              groupEmailMap[sg.id] = sg.default_sender_email_id;
            }
          });
        }
      }

      for (const contactId of finalContacts) {
        const contact = contacts.find((c) => c.id === contactId);
        if (!contact) continue;

        let senderEmailId = null;

        // Приоритет 1: default_sender_email_id контакта
        if (contact.default_sender_email_id) {
          senderEmailId = contact.default_sender_email_id;
        } else {
          // Приоритет 2: email override подгруппы
          const contactSubgroups = contactSubgroupMap[contactId] || [];

          for (const subgroupId of contactSubgroups) {
            const subgroupEmailId = groupEmailMap[subgroupId];
            if (subgroupEmailId) {
              // Проверяем исключения
              const { data: exclusions } = await supabase
                .from("contact_exclusions")
                .select("id")
                .eq("email_id", subgroupEmailId)
                .eq("contact_email", contact.email)
                .limit(1);

              if (!exclusions || exclusions.length === 0) {
                senderEmailId = subgroupEmailId;
                break;
              }
            }
          }
        }

        // Приоритет 3: первая доступная почта пользователя
        if (!senderEmailId) {
          senderEmailId = emails[0]?.id || null;
        }

        recipientsToCreate.push({
          mailing_id: mainMailing.id,
          contact_id: contactId,
          sender_email_id: senderEmailId,
          status: "pending",
          sent_at: null,
          error_message: null,
        });
      }

      if (recipientsToCreate.length > 0) {
        const { data: insertedRecipients } = await supabase
          .from("mailing_recipients")
          .insert(recipientsToCreate)
          .select();

        if (newMailing.send_now && insertedRecipients) {
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

          for (const recipient of insertedRecipients) {
            fetch(`${supabaseUrl}/functions/v1/send-email`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${supabaseKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ recipient_id: recipient.id }),
            }).catch((err) => console.error("Failed to send email:", err));
          }
        }
      }

      await supabase.from("activity_logs").insert({
        user_id: user.id,
        action_type: "create",
        entity_type: "mailing",
        entity_id: null,
        details: {
          subject: newMailing.subject,
          recipients_count: recipientsToCreate.length,
          send_now: newMailing.send_now,
        },
      });

      setNewMailing({
        subject: "",
        text_content: "",
        html_content: "",
        scheduled_at: "",
        scheduled_time: "",
        timezone: "UTC",
        selected_contacts: [],
        selected_groups: [],
        exclude_contacts: [],
        send_now: false,
        subgroup_email_overrides: {},
      });
      setSelectedSubgroups([]);
      setSelectedContacts([]);
      setExpandedSubgroups(new Set());
      setExpandedGroups(new Set());
      setShowCreateModal(false);
      loadMailings();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Ошибка при создании рассылки"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleEditMailing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !mailingToEdit) return;

    if (
      selectedContacts.length === 0 &&
      newMailing.selected_groups.length === 0 &&
      selectedSubgroups.length === 0
    ) {
      setError("Выберите хотя бы одного получателя или группу");
      return;
    }

    setLoading(true);
    setError("");

    try {
      let scheduledAt = null;
      if (
        !newMailing.send_now &&
        newMailing.scheduled_at &&
        newMailing.scheduled_time
      ) {
        const dateTime = `${newMailing.scheduled_at}T${newMailing.scheduled_time}:00`;
        scheduledAt = new Date(dateTime).toISOString();
      }

      await supabase
        .from("mailings")
        .update({
          subject: newMailing.subject,
          text_content: newMailing.text_content || null,
          html_content: newMailing.html_content || null,
          scheduled_at: scheduledAt,
          timezone: newMailing.timezone,
          updated_at: new Date().toISOString(),
        })
        .eq("id", mailingToEdit.id);

      await supabase
        .from("mailing_recipients")
        .delete()
        .eq("mailing_id", mailingToEdit.id);

      let allContactIds = [...newMailing.selected_contacts];

      for (const groupId of newMailing.selected_groups) {
        const { data: groupMembers } = await supabase
          .from("contact_group_members")
          .select("contact_id")
          .eq("group_id", groupId);

        if (groupMembers) {
          allContactIds.push(...groupMembers.map((m) => m.contact_id));
        }
      }

      allContactIds = [...new Set(allContactIds)];

      const finalContacts = allContactIds.filter(
        (id) => !newMailing.exclude_contacts.includes(id)
      );

      const recipients = finalContacts.map((contactId) => {
        const contact = contacts.find((c) => c.id === contactId);
        const senderEmailId =
          contact?.default_sender_email_id || emails[0]?.id || null;

        return {
          mailing_id: mailingToEdit.id,
          contact_id: contactId,
          sender_email_id: senderEmailId,
          status: "pending",
          sent_at: null,
          error_message: null,
        };
      });

      if (recipients.length > 0) {
        await supabase.from("mailing_recipients").insert(recipients);
      }

      await supabase.from("activity_logs").insert({
        user_id: user.id,
        action_type: "update",
        entity_type: "mailing",
        entity_id: mailingToEdit.id,
        details: {
          subject: newMailing.subject,
          recipients_count: recipients.length,
        },
      });

      setNewMailing({
        subject: "",
        text_content: "",
        html_content: "",
        scheduled_at: "",
        scheduled_time: "",
        timezone: "UTC",
        selected_contacts: [],
        selected_groups: [],
        exclude_contacts: [],
        send_now: false,
        subgroup_email_overrides: {},
      });
      setShowEditModal(false);
      setMailingToEdit(null);
      loadMailings();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Ошибка при редактировании рассылки"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMailing = async () => {
    if (!mailingToDelete) return;

    setLoading(true);
    try {
      await supabase
        .from("mailing_recipients")
        .delete()
        .eq("mailing_id", mailingToDelete.id);
      await supabase.from("mailings").delete().eq("id", mailingToDelete.id);

      await supabase.from("activity_logs").insert({
        user_id: user!.id,
        action_type: "delete",
        entity_type: "mailing",
        entity_id: mailingToDelete.id,
        details: { subject: mailingToDelete.subject },
      });

      setShowDeleteModal(false);
      setMailingToDelete(null);
      loadMailings();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Ошибка при удалении рассылки"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleViewMailing = async (mailing: MailingWithRecipients) => {
    setSelectedMailing(mailing);
    setShowViewModal(true);
  };

  const openEditModal = (mailing: MailingWithRecipients) => {
    setMailingToEdit(mailing);

    const scheduledDate = mailing.scheduled_at
      ? new Date(mailing.scheduled_at)
      : null;
    const scheduled_at = scheduledDate
      ? scheduledDate.toISOString().split("T")[0]
      : "";
    const scheduled_time = scheduledDate
      ? scheduledDate.toISOString().split("T")[1].substring(0, 5)
      : "";

    const recipientContactIds =
      mailing.recipients?.map((r) => r.contact_id) || [];

    setNewMailing({
      subject: mailing.subject,
      text_content: mailing.text_content || "",
      html_content: mailing.html_content || "",
      scheduled_at,
      scheduled_time,
      timezone: mailing.timezone,
      selected_contacts: recipientContactIds,
      selected_groups: [],
      exclude_contacts: [],
      send_now: false,
      subgroup_email_overrides: {},
    });

    setShowEditModal(true);
  };

  const handleSendNow = async (mailingId: string) => {
    setLoading(true);
    try {
      const { data: recipients } = await supabase
        .from("mailing_recipients")
        .select("id")
        .eq("mailing_id", mailingId)
        .eq("status", "pending");

      if (recipients) {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

        for (const recipient of recipients) {
          fetch(`${supabaseUrl}/functions/v1/send-email`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${supabaseKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ recipient_id: recipient.id }),
          }).catch((err) => console.error("Failed to send email:", err));
        }

        await supabase
          .from("mailings")
          .update({ status: "sending" })
          .eq("id", mailingId);

        loadMailings();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка при отправке");
    } finally {
      setLoading(false);
    }
  };

  const handleLoadTextFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === "text/plain") {
      const reader = new FileReader();
      reader.onload = (event) => {
        setNewMailing({
          ...newMailing,
          text_content: event.target?.result as string,
        });
      };
      reader.readAsText(file);
    }
  };

  const handleLoadHtmlFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === "text/html") {
      const reader = new FileReader();
      reader.onload = (event) => {
        setNewMailing({
          ...newMailing,
          html_content: event.target?.result as string,
        });
      };
      reader.readAsText(file);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "sent":
      case "completed":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            <CheckCircle className="w-3 h-3" />
            Отправлено
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
            <XCircle className="w-3 h-3" />
            Ошибка
          </span>
        );
      case "pending":
      case "sending":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
            <Clock className="w-3 h-3" />
            {status === "sending" ? "Отправка" : "Ожидание"}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400">
            {status}
          </span>
        );
    }
  };

  const hasPartialErrors = (mailing: MailingWithRecipients) => {
    return (
      (mailing.status === "sent" || mailing.status === "completed") &&
      mailing.success_count > 0 &&
      mailing.failed_count > 0
    );
  };

  const filteredMailings = mailings.filter((mailing) => {
    if (activeTab === "pending") {
      return mailing.status === "pending" || mailing.status === "sending";
    } else if (activeTab === "sent") {
      return mailing.status === "sent" || mailing.status === "completed";
    } else if (activeTab === "failed") {
      return mailing.status === "failed";
    }
    return true;
  });

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Управление рассылками
        </h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          <Plus className="w-5 h-5" />
          Создать рассылку
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-6">
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="flex">
            <button
              onClick={() => setActiveTab("pending")}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "pending"
                  ? "border-blue-600 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              Ожидают отправки
            </button>
            <button
              onClick={() => setActiveTab("sent")}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "sent"
                  ? "border-blue-600 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              Успешные
            </button>
            <button
              onClick={() => setActiveTab("failed")}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "failed"
                  ? "border-blue-600 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              Неудачные
            </button>
            <button
              onClick={() => setActiveTab("ping")}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "ping"
                  ? "border-blue-600 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              Пинг
            </button>
          </nav>
        </div>

        {activeTab === "ping" ? (
          <MailingsPingPage />
        ) : (
          <div className="p-6">
            {filteredMailings.length === 0 ? (
              <div className="text-center py-12">
                <Send className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400">
                  {activeTab === "pending" && "Нет рассылок в ожидании"}
                  {activeTab === "sent" && "Нет успешных рассылок"}
                  {activeTab === "failed" && "Нет неудачных рассылок"}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredMailings.map((mailing) => (
                  <div
                    key={mailing.id}
                    className="p-5 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-gray-900 dark:text-white">
                            {mailing.subject || "Без темы"}
                          </h3>
                          {getStatusBadge(mailing.status)}
                          {hasPartialErrors(mailing) && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
                              <XCircle className="w-3 h-3" />
                              Есть отправления с ошибкой
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                          <p>Получателей: {mailing.recipients?.length || 0}</p>
                          <p>
                            Успешно: {mailing.success_count} | Неудачно:{" "}
                            {mailing.failed_count}
                          </p>
                          {mailing.scheduled_at && (
                            <p>
                              Запланировано на:{" "}
                              {new Date(mailing.scheduled_at).toLocaleString(
                                "ru-RU"
                              )}{" "}
                              ({mailing.timezone})
                            </p>
                          )}
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Создано:{" "}
                            {new Date(mailing.created_at).toLocaleString(
                              "ru-RU"
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleViewMailing(mailing)}
                          className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                          title="Просмотр"
                        >
                          <Eye className="w-5 h-5" />
                        </button>
                        {mailing.status === "pending" && (
                          <>
                            <button
                              onClick={() => openEditModal(mailing)}
                              className="p-2 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors"
                              title="Редактировать"
                            >
                              <Edit2 className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => handleSendNow(mailing.id)}
                              disabled={loading}
                              className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors disabled:opacity-50"
                              title="Отправить сейчас"
                            >
                              <Send className="w-5 h-5" />
                            </button>
                          </>
                        )}
                        {(mailing.status === "pending" ||
                          mailing.status === "failed") && (
                          <button
                            onClick={() => {
                              setMailingToDelete(mailing);
                              setShowDeleteModal(true);
                            }}
                            className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                            title="Удалить"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-4xl w-full p-6 my-8 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              Создать рассылку
            </h2>

            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400">
                  {error}
                </p>
              </div>
            )}

            <form onSubmit={handleCreateMailing} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="w-4 h-4" />
                    Выбор групп
                  </div>
                </label>
                {groups.length === 0 ? (
                  <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-700">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Нет созданных групп
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {groups.map((group) => (
                      <GroupWithSubgroups
                        key={group.id}
                        group={group}
                        isSelected={newMailing.selected_groups.includes(group.id)}
                        isExpanded={expandedGroups.has(group.id)}
                        emails={emails}
                        selectedSubgroups={selectedSubgroups}
                        selectedContacts={selectedContacts}
                        subgroupEmailOverrides={newMailing.subgroup_email_overrides}
                        expandedSubgroups={expandedSubgroups}
                        onToggle={() => {
                          const newExpanded = new Set(expandedGroups);
                          if (expandedGroups.has(group.id)) {
                            newExpanded.delete(group.id);
                          } else {
                            newExpanded.add(group.id);
                          }
                          setExpandedGroups(newExpanded);
                        }}
                        onCheckChange={async (checked) => {
                          if (checked) {
                            setNewMailing({
                              ...newMailing,
                              selected_groups: [...newMailing.selected_groups, group.id],
                            });
                            // Выбираем все подгруппы и контакты этой группы
                            const { data: subgroups } = await supabase
                              .from("contact_groups")
                              .select("id")
                              .eq("parent_group_id", group.id);

                            if (subgroups && subgroups.length > 0) {
                              const subgroupIds = subgroups.map(s => s.id);
                              setSelectedSubgroups([...new Set([...selectedSubgroups, ...subgroupIds])]);

                              // Загружаем и выбираем все контакты из всех подгрупп
                              const allContactIds: string[] = [];
                              for (const subgroup of subgroups) {
                                const { data: members } = await supabase
                                  .from("contact_group_members")
                                  .select("contact_id")
                                  .eq("group_id", subgroup.id);
                                if (members) {
                                  allContactIds.push(...members.map(m => m.contact_id));
                                }
                              }
                              setSelectedContacts([...new Set([...selectedContacts, ...allContactIds])]);
                            }
                          } else {
                            // Снимаем выбор с группы
                            setNewMailing({
                              ...newMailing,
                              selected_groups: newMailing.selected_groups.filter(
                                (id) => id !== group.id
                              ),
                            });
                            // Снимаем выбор со всех подгрупп этой группы
                            const { data: subgroups } = await supabase
                              .from("contact_groups")
                              .select("id")
                              .eq("parent_group_id", group.id);

                            if (subgroups) {
                              const subgroupIds = subgroups.map(s => s.id);
                              setSelectedSubgroups(selectedSubgroups.filter(id => !subgroupIds.includes(id)));

                              // Снимаем выбор со всех контактов из этих подгрупп
                              const allContactIds: string[] = [];
                              for (const subgroup of subgroups) {
                                const { data: members } = await supabase
                                  .from("contact_group_members")
                                  .select("contact_id")
                                  .eq("group_id", subgroup.id);
                                if (members) {
                                  allContactIds.push(...members.map(m => m.contact_id));
                                }
                              }
                              setSelectedContacts(selectedContacts.filter(id => !allContactIds.includes(id)));
                            }
                          }
                        }}
                        onSubgroupCheck={async (subgroupId, checked) => {
                          if (checked) {
                            setSelectedSubgroups([...selectedSubgroups, subgroupId]);
                            // Снимаем галочку с родительской группы
                            setNewMailing({
                              ...newMailing,
                              selected_groups: newMailing.selected_groups.filter(
                                (id) => id !== group.id
                              ),
                            });
                            // Выбираем все контакты этой подгруппы
                            const { data: members } = await supabase
                              .from("contact_group_members")
                              .select("contact_id")
                              .eq("group_id", subgroupId);
                            if (members) {
                              const contactIds = members.map(m => m.contact_id);
                              setSelectedContacts([...new Set([...selectedContacts, ...contactIds])]);
                            }
                          } else {
                            setSelectedSubgroups(selectedSubgroups.filter(id => id !== subgroupId));
                            // Снимаем выбор со всех контактов этой подгруппы
                            const { data: members } = await supabase
                              .from("contact_group_members")
                              .select("contact_id")
                              .eq("group_id", subgroupId);
                            if (members) {
                              const contactIds = members.map(m => m.contact_id);
                              setSelectedContacts(selectedContacts.filter(id => !contactIds.includes(id)));
                            }
                          }
                        }}
                        onContactCheck={(contactId, checked) => {
                          if (checked) {
                            // Добавляем контакт в выбранные
                            setSelectedContacts([...selectedContacts, contactId]);
                            // Убираем из исключений, если был там
                            setNewMailing({
                              ...newMailing,
                              exclude_contacts: newMailing.exclude_contacts.filter(
                                (id) => id !== contactId
                              ),
                            });
                          } else {
                            // Убираем из выбранных
                            setSelectedContacts(selectedContacts.filter(id => id !== contactId));
                            // Добавляем в исключения
                            if (!newMailing.exclude_contacts.includes(contactId)) {
                              setNewMailing({
                                ...newMailing,
                                exclude_contacts: [...newMailing.exclude_contacts, contactId],
                              });
                            }
                          }
                        }}
                        onSubgroupToggle={(subgroupId) => {
                          const newExpanded = new Set(expandedSubgroups);
                          if (expandedSubgroups.has(subgroupId)) {
                            newExpanded.delete(subgroupId);
                          } else {
                            newExpanded.add(subgroupId);
                          }
                          setExpandedSubgroups(newExpanded);
                        }}
                        onEmailOverride={(subgroupId, emailId) => {
                          setNewMailing({
                            ...newMailing,
                            subgroup_email_overrides: {
                              ...newMailing.subgroup_email_overrides,
                              [subgroupId]: emailId,
                            },
                          });
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>


              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="send_now"
                  checked={newMailing.send_now}
                  onChange={(e) =>
                    setNewMailing({ ...newMailing, send_now: e.target.checked })
                  }
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <label
                  htmlFor="send_now"
                  className="text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Отправить сразу
                </label>
              </div>

              {!newMailing.send_now && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Дата
                    </label>
                    <input
                      type="date"
                      value={newMailing.scheduled_at}
                      onChange={(e) =>
                        setNewMailing({
                          ...newMailing,
                          scheduled_at: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Время
                    </label>
                    <input
                      type="time"
                      value={newMailing.scheduled_time}
                      onChange={(e) =>
                        setNewMailing({
                          ...newMailing,
                          scheduled_time: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Часовой пояс
                    </label>
                    <select
                      value={newMailing.timezone}
                      onChange={(e) =>
                        setNewMailing({
                          ...newMailing,
                          timezone: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                    >
                      {TIMEZONES.map((tz) => (
                        <option key={tz.iana} value={tz.iana}>
                          {tz.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewMailing({
                      subject: "",
                      text_content: "",
                      html_content: "",
                      scheduled_at: "",
                      scheduled_time: "",
                      timezone: "UTC",
                      selected_contacts: [],
                      selected_groups: [],
                      exclude_contacts: [],
                      send_now: false,
                      subgroup_email_overrides: {},
                    });
                    setSelectedSubgroups([]);
                    setSelectedContacts([]);
                    setExpandedSubgroups(new Set());
                    setExpandedGroups(new Set());
                    setError("");
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Отменить
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors"
                >
                  {loading ? "Создание..." : "Создать"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showViewModal && selectedMailing && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-4xl w-full p-6 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                Детали рассылки
              </h2>
              <button
                onClick={() => {
                  setShowViewModal(false);
                  setSelectedMailing(null);
                }}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Тема
                </label>
                <p className="text-gray-900 dark:text-white mt-1">
                  {selectedMailing.subject || "Без темы"}
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Статус
                </label>
                <div className="mt-1">
                  {getStatusBadge(selectedMailing.status)}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Получателей
                  </label>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    {selectedMailing.recipients?.length || 0}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Успешно
                  </label>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
                    {selectedMailing.success_count}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Неудачно
                  </label>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">
                    {selectedMailing.failed_count}
                  </p>
                </div>
              </div>

              {selectedMailing.text_content && (
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                    Текст письма
                  </label>
                  <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 max-h-64 overflow-y-auto">
                    <pre className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap font-mono">
                      {selectedMailing.text_content}
                    </pre>
                  </div>
                </div>
              )}

              {selectedMailing.html_content && (
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                    HTML письма
                  </label>
                  <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 max-h-64 overflow-y-auto">
                    <pre className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap font-mono">
                      {selectedMailing.html_content}
                    </pre>
                  </div>
                </div>
              )}

              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                  Получатели
                </label>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {selectedMailing.recipients?.map((recipient) => (
                    <div
                      key={recipient.id}
                      className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {recipient.contact?.email}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Отправитель: {recipient.sender_email?.email}
                          </p>
                        </div>
                        {getStatusBadge(recipient.status)}
                      </div>
                      {recipient.error_message && (
                        <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-xs text-red-600 dark:text-red-400">
                          <span className="font-medium">Ошибка: </span>
                          {recipient.error_message}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && mailingToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              Удалить рассылку?
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Вы уверены, что хотите удалить рассылку{" "}
              <strong>{mailingToDelete.subject}</strong>? Это действие нельзя
              отменить.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setMailingToDelete(null);
                }}
                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Отменить
              </button>
              <button
                onClick={handleDeleteMailing}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-lg transition-colors"
              >
                {loading ? "Удаление..." : "Удалить"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDuplicatesModal && duplicateMailings.length > 0 && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-4xl w-full p-6 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-red-600 dark:text-red-400">
                На данные контакты рассылка уже производилась
              </h2>
              <button
                onClick={() => {
                  setShowDuplicatesModal(false);
                  setDuplicateMailings([]);
                }}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Следующие контакты уже получали рассылки ранее. Раскройте каждый контакт, чтобы увидеть детали:
            </p>

            <div className="mb-6 space-y-2 max-h-96 overflow-y-auto">
              {duplicateMailings.map((duplicate) => {
                const isExpanded = expandedDuplicates.has(duplicate.contact_id);
                return (
                  <div
                    key={duplicate.contact_id}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                  >
                    <button
                      onClick={() => {
                        const newExpanded = new Set(expandedDuplicates);
                        if (isExpanded) {
                          newExpanded.delete(duplicate.contact_id);
                        } else {
                          newExpanded.add(duplicate.contact_id);
                        }
                        setExpandedDuplicates(newExpanded);
                      }}
                      className="w-full p-4 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <ChevronDown
                          className={`w-5 h-5 text-gray-600 dark:text-gray-400 transition-transform ${
                            isExpanded ? "" : "-rotate-90"
                          }`}
                        />
                        <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        <div className="text-left">
                          <p className="font-medium text-gray-900 dark:text-white">
                            {duplicate.contact_email}
                          </p>
                          {duplicate.contact_name && (
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {duplicate.contact_name}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        Рассылок: {duplicate.mailings.length}
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                        <div className="p-4 space-y-2 max-h-60 overflow-y-auto">
                          {duplicate.mailings.map((mailing, idx) => (
                            <div
                              key={idx}
                              className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-200 dark:border-gray-600"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                                    {mailing.subject}
                                  </p>
                                  <p className="text-xs text-gray-600 dark:text-gray-400">
                                    Отправитель: {mailing.sender_email}
                                  </p>
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    {new Date(mailing.sent_at).toLocaleString("ru-RU")}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDuplicatesModal(false);
                  setDuplicateMailings([]);
                  setExpandedDuplicates(new Set());
                  setShowCreateModal(true);
                }}
                className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Edit2 className="w-5 h-5" />
                Редактировать рассылку
              </button>
              <button
                onClick={async () => {
                  setShowDuplicatesModal(false);
                  setDuplicateMailings([]);
                  setExpandedDuplicates(new Set());
                  await proceedWithMailingCreation();
                }}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors"
              >
                {loading ? "Создание..." : "Проигнорировать и продолжить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
