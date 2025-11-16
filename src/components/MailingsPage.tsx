import { useState, useEffect } from 'react';
import { Send, Plus, Trash2, Eye, X, CheckCircle, XCircle, Clock, Upload } from 'lucide-react';
import { supabase, Mailing, Contact, Email } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

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
  { label: 'ET', iana: 'America/New_York' },
  { label: 'CT', iana: 'America/Chicago' },
  { label: 'MT', iana: 'America/Denver' },
  { label: 'PT', iana: 'America/Los_Angeles' },
  { label: 'GMT', iana: 'Etc/GMT' },
  { label: 'UTC', iana: 'Etc/UTC' },
  { label: 'CET', iana: 'Europe/Berlin' },
  { label: 'EET', iana: 'Europe/Helsinki' },
  { label: 'MSK', iana: 'Europe/Moscow' },
  { label: 'IST', iana: 'Asia/Kolkata' },
  { label: 'CST', iana: 'Asia/Shanghai' },
  { label: 'HKT', iana: 'Asia/Hong_Kong' },
  { label: 'JST', iana: 'Asia/Tokyo' },
  { label: 'KST', iana: 'Asia/Seoul' },
];

export function MailingsPage() {
  const { user } = useAuth();
  const [mailings, setMailings] = useState<MailingWithRecipients[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedMailing, setSelectedMailing] = useState<MailingWithRecipients | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [mailingToDelete, setMailingToDelete] = useState<Mailing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'pending' | 'sent' | 'failed'>('pending');

  const [newMailing, setNewMailing] = useState({
    subject: '',
    text_content: '',
    html_content: '',
    scheduled_at: '',
    scheduled_time: '',
    timezone: 'UTC',
    selected_contacts: [] as string[],
    exclude_contacts: [] as string[],
    send_now: false,
  });

  useEffect(() => {
    if (user) {
      loadMailings();
      loadContacts();
      loadEmails();
    }
  }, [user]);

  const loadMailings = async () => {
    if (!user) return;

    const { data: mailingsData } = await supabase
      .from('mailings')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (mailingsData) {
      const mailingsWithRecipients = await Promise.all(
        mailingsData.map(async (mailing) => {
          const { data: recipients } = await supabase
            .from('mailing_recipients')
            .select(`
              *,
              contact:contacts(*),
              sender_email:emails(*)
            `)
            .eq('mailing_id', mailing.id);

          return {
            ...mailing,
            recipients: recipients || [],
          };
        })
      );

      setMailings(mailingsWithRecipients);
    }
  };

  const loadContacts = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('contacts')
      .select('*')
      .eq('owner_id', user.id)
      .order('email', { ascending: true });

    if (data) {
      setContacts(data);
    }
  };

  const loadEmails = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('emails')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active');

    if (data) {
      setEmails(data);
    }
  };

  const handleCreateMailing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!newMailing.text_content && !newMailing.html_content) {
      setError('Необходимо заполнить хотя бы одно из полей: текст или HTML');
      return;
    }

    if (newMailing.selected_contacts.length === 0) {
      setError('Выберите хотя бы одного получателя');
      return;
    }

    setLoading(true);
    setError('');

    try {
      let scheduledAt = null;
      if (!newMailing.send_now && newMailing.scheduled_at && newMailing.scheduled_time) {
        const dateTime = `${newMailing.scheduled_at}T${newMailing.scheduled_time}:00`;
        scheduledAt = new Date(dateTime).toISOString();
      }

      const { data: mailing, error: mailingError } = await supabase
        .from('mailings')
        .insert({
          user_id: user.id,
          subject: newMailing.subject,
          text_content: newMailing.text_content || null,
          html_content: newMailing.html_content || null,
          scheduled_at: scheduledAt,
          timezone: newMailing.timezone,
          status: newMailing.send_now ? 'sending' : 'pending',
          sent_count: 0,
          success_count: 0,
          failed_count: 0,
        })
        .select()
        .single();

      if (mailingError) throw mailingError;

      const finalContacts = newMailing.selected_contacts.filter(
        (id) => !newMailing.exclude_contacts.includes(id)
      );

      const recipients = finalContacts.map((contactId) => {
        const contact = contacts.find((c) => c.id === contactId);
        const senderEmailId = contact?.default_sender_email_id || emails[0]?.id || null;

        return {
          mailing_id: mailing.id,
          contact_id: contactId,
          sender_email_id: senderEmailId,
          status: 'pending',
          sent_at: null,
          error_message: null,
        };
      });

      if (recipients.length > 0) {
        const { data: insertedRecipients } = await supabase
          .from('mailing_recipients')
          .insert(recipients)
          .select();

        if (newMailing.send_now && insertedRecipients) {
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

          for (const recipient of insertedRecipients) {
            fetch(`${supabaseUrl}/functions/v1/send-email`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ recipient_id: recipient.id }),
            }).catch((err) => console.error('Failed to send email:', err));
          }
        }
      }

      await supabase.from('activity_logs').insert({
        user_id: user.id,
        action_type: 'create',
        entity_type: 'mailing',
        entity_id: mailing.id,
        details: {
          subject: newMailing.subject,
          recipients_count: recipients.length,
          send_now: newMailing.send_now,
        },
      });

      setNewMailing({
        subject: '',
        text_content: '',
        html_content: '',
        scheduled_at: '',
        scheduled_time: '',
        timezone: 'UTC',
        selected_contacts: [],
        exclude_contacts: [],
        send_now: false,
      });
      setShowCreateModal(false);
      loadMailings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при создании рассылки');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMailing = async () => {
    if (!mailingToDelete) return;

    setLoading(true);
    try {
      await supabase.from('mailing_recipients').delete().eq('mailing_id', mailingToDelete.id);
      await supabase.from('mailings').delete().eq('id', mailingToDelete.id);

      await supabase.from('activity_logs').insert({
        user_id: user!.id,
        action_type: 'delete',
        entity_type: 'mailing',
        entity_id: mailingToDelete.id,
        details: { subject: mailingToDelete.subject },
      });

      setShowDeleteModal(false);
      setMailingToDelete(null);
      loadMailings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при удалении рассылки');
    } finally {
      setLoading(false);
    }
  };

  const handleViewMailing = async (mailing: MailingWithRecipients) => {
    setSelectedMailing(mailing);
    setShowViewModal(true);
  };

  const handleSendNow = async (mailingId: string) => {
    setLoading(true);
    try {
      const { data: recipients } = await supabase
        .from('mailing_recipients')
        .select('id')
        .eq('mailing_id', mailingId)
        .eq('status', 'pending');

      if (recipients) {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

        for (const recipient of recipients) {
          fetch(`${supabaseUrl}/functions/v1/send-email`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ recipient_id: recipient.id }),
          }).catch((err) => console.error('Failed to send email:', err));
        }

        await supabase
          .from('mailings')
          .update({ status: 'sending' })
          .eq('id', mailingId);

        loadMailings();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при отправке');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadTextFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'text/plain') {
      const reader = new FileReader();
      reader.onload = (event) => {
        setNewMailing({ ...newMailing, text_content: event.target?.result as string });
      };
      reader.readAsText(file);
    }
  };

  const handleLoadHtmlFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'text/html') {
      const reader = new FileReader();
      reader.onload = (event) => {
        setNewMailing({ ...newMailing, html_content: event.target?.result as string });
      };
      reader.readAsText(file);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'sent':
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            <CheckCircle className="w-3 h-3" />
            Отправлено
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
            <XCircle className="w-3 h-3" />
            Ошибка
          </span>
        );
      case 'pending':
      case 'sending':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
            <Clock className="w-3 h-3" />
            {status === 'sending' ? 'Отправка' : 'Ожидание'}
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

  const filteredMailings = mailings.filter((mailing) => {
    if (activeTab === 'pending') {
      return mailing.status === 'pending' || mailing.status === 'sending';
    } else if (activeTab === 'sent') {
      return mailing.status === 'sent' || mailing.status === 'completed';
    } else if (activeTab === 'failed') {
      return mailing.status === 'failed';
    }
    return true;
  });

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Управление рассылками</h1>
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
              onClick={() => setActiveTab('pending')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'pending'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              Ожидают отправки
            </button>
            <button
              onClick={() => setActiveTab('sent')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'sent'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              Успешные
            </button>
            <button
              onClick={() => setActiveTab('failed')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'failed'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              Неудачные
            </button>
          </nav>
        </div>

        <div className="p-6">
          {filteredMailings.length === 0 ? (
            <div className="text-center py-12">
              <Send className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400">
                {activeTab === 'pending' && 'Нет рассылок в ожидании'}
                {activeTab === 'sent' && 'Нет успешных рассылок'}
                {activeTab === 'failed' && 'Нет неудачных рассылок'}
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
                          {mailing.subject || 'Без темы'}
                        </h3>
                        {getStatusBadge(mailing.status)}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                        <p>Получателей: {mailing.recipients?.length || 0}</p>
                        <p>Успешно: {mailing.success_count} | Неудачно: {mailing.failed_count}</p>
                        {mailing.scheduled_at && (
                          <p>
                            Запланировано на: {new Date(mailing.scheduled_at).toLocaleString('ru-RU')} ({mailing.timezone})
                          </p>
                        )}
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Создано: {new Date(mailing.created_at).toLocaleString('ru-RU')}
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
                      {mailing.status === 'pending' && (
                        <button
                          onClick={() => handleSendNow(mailing.id)}
                          disabled={loading}
                          className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors disabled:opacity-50"
                          title="Отправить сейчас"
                        >
                          <Send className="w-5 h-5" />
                        </button>
                      )}
                      {(mailing.status === 'pending' || mailing.status === 'failed') && (
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
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-4xl w-full p-6 my-8 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Создать рассылку</h2>

            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <form onSubmit={handleCreateMailing} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Тема письма
                </label>
                <input
                  type="text"
                  value={newMailing.subject}
                  onChange={(e) => setNewMailing({ ...newMailing, subject: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                  placeholder="Введите тему письма"
                  required
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Текст письма
                    </label>
                    <label className="flex items-center gap-2 px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded cursor-pointer transition-colors">
                      <Upload className="w-3 h-3" />
                      Загрузить .txt
                      <input
                        type="file"
                        accept=".txt"
                        onChange={handleLoadTextFile}
                        className="hidden"
                      />
                    </label>
                  </div>
                  <textarea
                    value={newMailing.text_content}
                    onChange={(e) => setNewMailing({ ...newMailing, text_content: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white font-mono text-sm"
                    placeholder="Введите текст письма"
                    rows={8}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      HTML письма
                    </label>
                    <label className="flex items-center gap-2 px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded cursor-pointer transition-colors">
                      <Upload className="w-3 h-3" />
                      Загрузить .html
                      <input
                        type="file"
                        accept=".html"
                        onChange={handleLoadHtmlFile}
                        className="hidden"
                      />
                    </label>
                  </div>
                  <textarea
                    value={newMailing.html_content}
                    onChange={(e) => setNewMailing({ ...newMailing, html_content: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white font-mono text-sm"
                    placeholder="Введите HTML код"
                    rows={8}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Выбор получателей
                </label>
                <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 max-h-48 overflow-y-auto bg-gray-50 dark:bg-gray-700">
                  <div className="space-y-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={newMailing.selected_contacts.length === contacts.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewMailing({
                              ...newMailing,
                              selected_contacts: contacts.map((c) => c.id),
                            });
                          } else {
                            setNewMailing({ ...newMailing, selected_contacts: [] });
                          }
                        }}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        Выбрать всех
                      </span>
                    </label>
                    <div className="border-t border-gray-200 dark:border-gray-600 my-2" />
                    {contacts.map((contact) => (
                      <label key={contact.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={newMailing.selected_contacts.includes(contact.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewMailing({
                                ...newMailing,
                                selected_contacts: [...newMailing.selected_contacts, contact.id],
                              });
                            } else {
                              setNewMailing({
                                ...newMailing,
                                selected_contacts: newMailing.selected_contacts.filter((id) => id !== contact.id),
                              });
                            }
                          }}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          {contact.email} {contact.name && `(${contact.name})`}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="send_now"
                  checked={newMailing.send_now}
                  onChange={(e) => setNewMailing({ ...newMailing, send_now: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <label htmlFor="send_now" className="text-sm font-medium text-gray-700 dark:text-gray-300">
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
                      onChange={(e) => setNewMailing({ ...newMailing, scheduled_at: e.target.value })}
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
                      onChange={(e) => setNewMailing({ ...newMailing, scheduled_time: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Часовой пояс
                    </label>
                    <select
                      value={newMailing.timezone}
                      onChange={(e) => setNewMailing({ ...newMailing, timezone: e.target.value })}
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
                      subject: '',
                      text_content: '',
                      html_content: '',
                      scheduled_at: '',
                      scheduled_time: '',
                      timezone: 'UTC',
                      selected_contacts: [],
                      exclude_contacts: [],
                      send_now: false,
                    });
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
                  {loading ? 'Создание...' : 'Создать'}
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
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Детали рассылки</h2>
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
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Тема</label>
                <p className="text-gray-900 dark:text-white mt-1">{selectedMailing.subject || 'Без темы'}</p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Статус</label>
                <div className="mt-1">{getStatusBadge(selectedMailing.status)}</div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Получателей</label>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    {selectedMailing.recipients?.length || 0}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Успешно</label>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
                    {selectedMailing.success_count}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Неудачно</label>
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
                      className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 flex items-center justify-between"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {recipient.contact?.email}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Отправитель: {recipient.sender_email?.email}
                        </p>
                      </div>
                      {getStatusBadge(recipient.status)}
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
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Удалить рассылку?</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Вы уверены, что хотите удалить рассылку <strong>{mailingToDelete.subject}</strong>? Это действие нельзя отменить.
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
                {loading ? 'Удаление...' : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
