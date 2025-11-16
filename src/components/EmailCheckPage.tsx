import { useState, useEffect } from 'react';
import { Search, Mail, CheckCircle, XCircle, Clock, History } from 'lucide-react';
import { supabase, Contact } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface MailingRecipient {
  id: string;
  mailing_id: string;
  contact_id: string;
  sender_email_id: string;
  status: string;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
  mailing?: {
    subject: string;
    text_content: string | null;
    html_content: string | null;
  };
  sender_email?: {
    email: string;
  };
}

interface ContactHistory {
  id: string;
  contact_id: string;
  action_type: string;
  changed_fields: Record<string, unknown>;
  changed_by: string;
  created_at: string;
}

export function EmailCheckPage() {
  const { user } = useAuth();
  const [searchEmail, setSearchEmail] = useState('');
  const [contact, setContact] = useState<Contact | null>(null);
  const [mailings, setMailings] = useState<MailingRecipient[]>([]);
  const [history, setHistory] = useState<ContactHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchEmail || !user) return;

    setLoading(true);
    setSearched(true);

    try {
      const { data: contactData } = await supabase
        .from('contacts')
        .select('*')
        .eq('email', searchEmail)
        .eq('owner_id', user.id)
        .maybeSingle();

      setContact(contactData);

      if (contactData) {
        const { data: mailingsData } = await supabase
          .from('mailing_recipients')
          .select(`
            *,
            mailing:mailings(subject, text_content, html_content),
            sender_email:emails(email)
          `)
          .eq('contact_id', contactData.id)
          .order('created_at', { ascending: false });

        const { data: historyData } = await supabase
          .from('contact_history')
          .select('*')
          .eq('contact_id', contactData.id)
          .order('created_at', { ascending: false });

        setMailings(mailingsData || []);
        setHistory(historyData || []);
      } else {
        setMailings([]);
        setHistory([]);
      }
    } catch (error) {
      console.error('Error searching email:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'sent':
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
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
            <Clock className="w-3 h-3" />
            Ожидание
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

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Проверка почты</h1>
        <p className="text-gray-600 dark:text-gray-400">Поиск истории отправлений по email адресу</p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <form onSubmit={handleSearch} className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="email"
              value={searchEmail}
              onChange={(e) => setSearchEmail(e.target.value)}
              placeholder="Введите email адрес для поиска"
              className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Поиск...
              </>
            ) : (
              <>
                <Search className="w-5 h-5" />
                Найти
              </>
            )}
          </button>
        </form>
      </div>

      {searched && !loading && (
        <>
          {!contact ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
              <Mail className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600 dark:text-gray-400">Контакт с таким email не найден</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <Mail className="w-5 h-5" />
                  Информация о контакте
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
                    <p className="text-gray-900 dark:text-white mt-1">{contact.email}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Имя</label>
                    <p className="text-gray-900 dark:text-white mt-1">{contact.name || 'Не указано'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Ссылка</label>
                    <p className="text-gray-900 dark:text-white mt-1">
                      {contact.link ? (
                        <a href={contact.link} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
                          Открыть
                        </a>
                      ) : (
                        'Не указана'
                      )}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5" />
                  История отправлений ({mailings.length})
                </h2>
                {mailings.length === 0 ? (
                  <p className="text-gray-500 dark:text-gray-400">Нет отправлений на этот адрес</p>
                ) : (
                  <div className="space-y-3">
                    {mailings.map((mailing) => (
                      <div
                        key={mailing.id}
                        className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <h3 className="font-medium text-gray-900 dark:text-white mb-1">
                              {mailing.mailing?.subject || 'Без темы'}
                            </h3>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              Отправлено с: {mailing.sender_email?.email || 'Неизвестно'}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {mailing.sent_at
                                ? new Date(mailing.sent_at).toLocaleString('ru-RU')
                                : 'Не отправлено'}
                            </p>
                          </div>
                          {getStatusBadge(mailing.status)}
                        </div>
                        {mailing.error_message && (
                          <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-xs text-red-600 dark:text-red-400">
                            Ошибка: {mailing.error_message}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <History className="w-5 h-5" />
                  История изменений ({history.length})
                </h2>
                {history.length === 0 ? (
                  <p className="text-gray-500 dark:text-gray-400">Нет истории изменений</p>
                ) : (
                  <div className="space-y-2">
                    {history.map((record) => (
                      <div
                        key={record.id}
                        className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              {record.action_type === 'update' && 'Обновление данных'}
                              {record.action_type === 'create' && 'Создание контакта'}
                            </p>
                            {Object.keys(record.changed_fields).length > 0 && (
                              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                Изменено: {Object.keys(record.changed_fields).join(', ')}
                              </p>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {new Date(record.created_at).toLocaleString('ru-RU')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
