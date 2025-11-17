import { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Trash2, Users, Mail, Upload, FileText } from 'lucide-react';
import { supabase, ContactGroup, Contact } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface ContactGroupDetailPageProps {
  groupId: string;
  onBack: () => void;
}

interface BatchResult {
  total: number;
  created: number;
  createdEmails: string[];
}

export function ContactGroupDetailPage({ groupId, onBack }: ContactGroupDetailPageProps) {
  const { user } = useAuth();
  const [group, setGroup] = useState<ContactGroup | null>(null);
  const [groupContacts, setGroupContacts] = useState<Contact[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);

  const [newContacts, setNewContacts] = useState([{ email: '', name: '', link: '' }]);

  useEffect(() => {
    if (user && groupId) {
      loadGroupData();
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
          .in('id', contactIds)
          .order('created_at', { ascending: false });

        if (contactsData) {
          setGroupContacts(contactsData);
        }
      } else {
        setGroupContacts([]);
      }
    }
  };

  const handleAddContacts = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    setError('');

    try {
      const createdContacts: string[] = [];

      for (const contact of newContacts) {
        if (!contact.email) continue;

        const { data: existingContacts } = await supabase
          .from('contacts')
          .select('*, owner:users!contacts_owner_id_fkey(login)')
          .eq('email', contact.email);

        const myContact = existingContacts?.find(c => c.owner_id === user.id);

        if (myContact) {
          const { data: existingMember } = await supabase
            .from('contact_group_members')
            .select('id')
            .eq('group_id', groupId)
            .eq('contact_id', myContact.id)
            .maybeSingle();

          if (!existingMember) {
            await supabase.from('contact_group_members').insert({
              group_id: groupId,
              contact_id: myContact.id,
            });
          }
          continue;
        }

        const { data: newContact, error: insertError } = await supabase
          .from('contacts')
          .insert({
            email: contact.email,
            name: contact.name,
            link: contact.link,
            owner_id: user.id,
            has_changes: false,
          })
          .select()
          .single();

        if (insertError) throw insertError;

        if (newContact) {
          await supabase.from('contact_group_members').insert({
            group_id: groupId,
            contact_id: newContact.id,
          });

          createdContacts.push(contact.email);

          await supabase.from('activity_logs').insert({
            user_id: user.id,
            action_type: 'create',
            entity_type: 'contact',
            entity_id: newContact.id,
            details: { email: contact.email, group_id: groupId },
          });
        }
      }

      setNewContacts([{ email: '', name: '', link: '' }]);
      setShowAddModal(false);
      loadGroupData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при добавлении контактов');
    } finally {
      setLoading(false);
    }
  };

  const handleBatchUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setBatchProcessing(true);
    setBatchProgress(0);
    setBatchResult(null);
    setError('');

    try {
      const text = await file.text();
      const lines = text.split('\n').map(line => line.trim());

      const contacts: Array<{ email: string; link: string; name: string }> = [];
      let currentContact: { email?: string; link?: string; name?: string } = {};
      let lineIndex = 0;

      for (const line of lines) {
        if (line === '') {
          if (currentContact.email && currentContact.link && currentContact.name) {
            contacts.push({
              email: currentContact.email,
              link: currentContact.link,
              name: currentContact.name,
            });
          }
          currentContact = {};
          lineIndex = 0;
        } else {
          if (lineIndex === 0) {
            currentContact.email = line;
          } else if (lineIndex === 1) {
            currentContact.link = line;
          } else if (lineIndex === 2) {
            currentContact.name = line;
          }
          lineIndex++;
        }
      }

      if (currentContact.email && currentContact.link && currentContact.name) {
        contacts.push({
          email: currentContact.email,
          link: currentContact.link,
          name: currentContact.name,
        });
      }

      if (contacts.length === 0) {
        throw new Error('Не найдено валидных контактов в файле');
      }

      const createdEmails: string[] = [];
      let created = 0;

      for (let i = 0; i < contacts.length; i++) {
        const contact = contacts[i];
        setBatchProgress(Math.round(((i + 1) / contacts.length) * 100));

        try {
          const { data: existingContacts } = await supabase
            .from('contacts')
            .select('id, owner_id')
            .eq('email', contact.email);

          const myContact = existingContacts?.find(c => c.owner_id === user.id);

          if (myContact) {
            const { data: existingMember } = await supabase
              .from('contact_group_members')
              .select('id')
              .eq('group_id', groupId)
              .eq('contact_id', myContact.id)
              .maybeSingle();

            if (!existingMember) {
              await supabase.from('contact_group_members').insert({
                group_id: groupId,
                contact_id: myContact.id,
              });
            }
            continue;
          }

          const { data: newContact, error: insertError } = await supabase
            .from('contacts')
            .insert({
              email: contact.email,
              name: contact.name,
              link: contact.link,
              owner_id: user.id,
              has_changes: false,
            })
            .select()
            .single();

          if (insertError) {
            console.error(`Error creating contact ${contact.email}:`, insertError);
            continue;
          }

          if (newContact) {
            await supabase.from('contact_group_members').insert({
              group_id: groupId,
              contact_id: newContact.id,
            });

            createdEmails.push(contact.email);
            created++;

            await supabase.from('activity_logs').insert({
              user_id: user.id,
              action_type: 'create',
              entity_type: 'contact',
              entity_id: newContact.id,
              details: { email: contact.email, group_id: groupId, batch_import: true },
            });
          }
        } catch (err) {
          console.error(`Failed to process contact ${contact.email}:`, err);
        }
      }

      setBatchResult({
        total: contacts.length,
        created,
        createdEmails,
      });

      loadGroupData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при обработке файла');
    } finally {
      setBatchProcessing(false);
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
          <div className="flex gap-3">
            <button
              onClick={() => setShowBatchModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
            >
              <Upload className="w-5 h-5" />
              Пакетное создание
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <Plus className="w-5 h-5" />
              Добавить контакты
            </button>
          </div>
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

            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <form onSubmit={handleAddContacts} className="space-y-4">
              {newContacts.map((contact, index) => (
                <div key={index} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-gray-900 dark:text-white">Контакт {index + 1}</h3>
                    {newContacts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setNewContacts(newContacts.filter((_, i) => i !== index))}
                        className="text-red-600 hover:text-red-700 text-sm"
                      >
                        Удалить
                      </button>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Email <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="email"
                      value={contact.email}
                      onChange={(e) => {
                        const updated = [...newContacts];
                        updated[index].email = e.target.value;
                        setNewContacts(updated);
                      }}
                      className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                      placeholder="example@mail.com"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Имя <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      value={contact.name}
                      onChange={(e) => {
                        const updated = [...newContacts];
                        updated[index].name = e.target.value;
                        setNewContacts(updated);
                      }}
                      className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                      placeholder="Имя контакта"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Ссылка <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="url"
                      value={contact.link}
                      onChange={(e) => {
                        const updated = [...newContacts];
                        updated[index].link = e.target.value;
                        setNewContacts(updated);
                      }}
                      className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                      placeholder="https://example.com"
                      required
                    />
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={() => setNewContacts([...newContacts, { email: '', name: '', link: '' }])}
                className="w-full px-4 py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-lg hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                + Добавить еще контакт
              </button>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setNewContacts([{ email: '', name: '', link: '' }]);
                    setError('');
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
                  {loading ? 'Добавление...' : 'Добавить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showBatchModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full p-6 my-8">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Пакетное создание контактов</h2>

            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            {!batchProcessing && !batchResult && (
              <div className="space-y-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    Формат файла
                  </h3>
                  <div className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
                    <p>Загрузите текстовый файл (.txt) со следующей структурой:</p>
                    <pre className="bg-white dark:bg-gray-700 p-3 rounded border border-gray-200 dark:border-gray-600 font-mono text-xs">
email@example.com{'\n'}https://example.com{'\n'}Имя контакта{'\n'}{'\n'}email2@example.com{'\n'}https://example2.com{'\n'}Имя контакта 2
                    </pre>
                    <p className="text-xs">Пустая строка разделяет контакты</p>
                  </div>
                </div>

                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:border-blue-500 dark:hover:border-blue-400 transition-colors">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="w-10 h-10 mb-2 text-gray-400" />
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Нажмите для загрузки файла .txt
                    </p>
                  </div>
                  <input
                    type="file"
                    accept=".txt"
                    onChange={handleBatchUpload}
                    className="hidden"
                  />
                </label>

                <button
                  onClick={() => {
                    setShowBatchModal(false);
                    setError('');
                  }}
                  className="w-full px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Отменить
                </button>
              </div>
            )}

            {batchProcessing && (
              <div className="space-y-4">
                <div className="text-center">
                  <p className="text-gray-900 dark:text-white mb-4">Обработка контактов...</p>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4">
                    <div
                      className="bg-blue-600 h-4 rounded-full transition-all duration-300"
                      style={{ width: `${batchProgress}%` }}
                    />
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">{batchProgress}%</p>
                </div>
              </div>
            )}

            {batchResult && (
              <div className="space-y-4">
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Результат импорта</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Создано <strong>{batchResult.created}</strong> из <strong>{batchResult.total}</strong> контактов
                  </p>
                </div>

                {batchResult.createdEmails.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Созданные контакты:</h4>
                    <div className="max-h-64 overflow-y-auto bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 space-y-1">
                      {batchResult.createdEmails.map((email, index) => (
                        <div
                          key={index}
                          className="text-sm text-gray-700 dark:text-gray-300 py-1 px-2 bg-white dark:bg-gray-700 rounded"
                        >
                          {email}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={() => {
                    setShowBatchModal(false);
                    setBatchResult(null);
                    setBatchProgress(0);
                    setError('');
                  }}
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  Закрыть
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
