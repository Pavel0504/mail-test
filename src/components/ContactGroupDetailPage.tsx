import { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Trash2, Users, Mail } from 'lucide-react';
import { supabase, ContactGroup, Contact } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface ContactGroupDetailPageProps {
  groupId: string;
  onBack: () => void;
}

export function ContactGroupDetailPage({ groupId, onBack }: ContactGroupDetailPageProps) {
  const { user } = useAuth();
  const [group, setGroup] = useState<ContactGroup | null>(null);
  const [groupContacts, setGroupContacts] = useState<Contact[]>([]);
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (user && groupId) {
      loadGroupData();
      loadAllContacts();
    }
  }, [user, groupId]);

  const loadGroupData = async () => {
    const { data: groupData } = await supabase
      .from('contact_groups')
      .select('*')
      .eq('id', groupId)
      .single();

    if (groupData) {
      setGroup(groupData);
    }

    const { data: membersData } = await supabase
      .from('contact_group_members')
      .select('contact_id')
      .eq('group_id', groupId);

    if (membersData) {
      const contactIds = membersData.map((m) => m.contact_id);
      if (contactIds.length > 0) {
        const { data: contactsData } = await supabase
          .from('contacts')
          .select('*')
          .in('id', contactIds);

        if (contactsData) {
          setGroupContacts(contactsData);
        }
      } else {
        setGroupContacts([]);
      }
    }
  };

  const loadAllContacts = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('contacts')
      .select('*')
      .eq('owner_id', user.id)
      .order('email', { ascending: true });

    if (data) {
      setAllContacts(data);
    }
  };

  const handleAddContacts = async () => {
    if (!user || selectedContacts.length === 0) return;

    setLoading(true);
    try {
      const members = selectedContacts.map((contactId) => ({
        group_id: groupId,
        contact_id: contactId,
      }));

      await supabase.from('contact_group_members').insert(members);

      await supabase.from('activity_logs').insert({
        user_id: user.id,
        action_type: 'add_to_group',
        entity_type: 'contact_group',
        entity_id: groupId,
        details: { added_count: selectedContacts.length },
      });

      setSelectedContacts([]);
      setShowAddModal(false);
      loadGroupData();
    } catch (err) {
      console.error('Error adding contacts:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveContact = async (contactId: string) => {
    if (!user) return;

    try {
      await supabase
        .from('contact_group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('contact_id', contactId);

      await supabase.from('activity_logs').insert({
        user_id: user.id,
        action_type: 'remove_from_group',
        entity_type: 'contact_group',
        entity_id: groupId,
        details: { contact_id: contactId },
      });

      loadGroupData();
    } catch (err) {
      console.error('Error removing contact:', err);
    }
  };

  const availableContacts = allContacts.filter(
    (contact) =>
      !groupContacts.some((gc) => gc.id === contact.id) &&
      (contact.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        contact.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  if (!group) {
    return (
      <div className="p-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
          <p className="text-gray-500 dark:text-gray-400">Загрузка...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors mb-4"
        >
          <ArrowLeft className="w-5 h-5" />
          Назад к группам
        </button>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{group.name}</h1>
            <p className="text-gray-600 dark:text-gray-400">Контактов в группе: {groupContacts.length}</p>
            {group.default_subject && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Тема по умолчанию: {group.default_subject}
              </p>
            )}
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            <Plus className="w-5 h-5" />
            Добавить контакты
          </button>
        </div>
      </div>

      {groupContacts.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
          <Users className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400">Нет контактов в группе</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="mt-4 text-blue-600 dark:text-blue-400 hover:underline"
          >
            Добавить контакты
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {groupContacts.map((contact) => (
            <div
              key={contact.id}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    <h3 className="font-semibold text-gray-900 dark:text-white">{contact.email}</h3>
                  </div>
                  {contact.name && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Имя: {contact.name}</p>
                  )}
                  {contact.link && (
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Ссылка:{' '}
                      <a
                        href={contact.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {contact.link}
                      </a>
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleRemoveContact(contact.id)}
                  className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  title="Удалить из группы"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full p-6 my-8 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Добавить контакты в группу</h2>

            <div className="mb-4">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по email или имени..."
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
              />
            </div>

            {availableContacts.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                {allContacts.length === groupContacts.length
                  ? 'Все контакты уже добавлены в группу'
                  : 'Контакты не найдены'}
              </div>
            ) : (
              <div className="space-y-2 mb-4 max-h-96 overflow-y-auto">
                {availableContacts.map((contact) => (
                  <label
                    key={contact.id}
                    className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedContacts.includes(contact.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedContacts([...selectedContacts, contact.id]);
                        } else {
                          setSelectedContacts(selectedContacts.filter((id) => id !== contact.id));
                        }
                      }}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <p className="font-medium text-gray-900 dark:text-white">{contact.email}</p>
                      {contact.name && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">{contact.name}</p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  setSelectedContacts([]);
                  setSearchQuery('');
                }}
                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Отменить
              </button>
              <button
                onClick={handleAddContacts}
                disabled={loading || selectedContacts.length === 0}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors"
              >
                {loading ? 'Добавление...' : `Добавить (${selectedContacts.length})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
