import { useState, useEffect } from 'react';
import { Mail, Clock, CheckCircle, Send, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase, MailingPingTracking, Mailing, Contact } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface PingTrackingWithDetails extends MailingPingTracking {
  recipient?: {
    contact?: Contact;
    mailing?: Mailing;
    sender_email?: {
      email: string;
    };
  };
}

export function MailingsPingPage() {
  const { user } = useAuth();
  const [pingTrackings, setPingTrackings] = useState<PingTrackingWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      loadPingTrackings();
      const interval = setInterval(loadPingTrackings, 5000);
      return () => clearInterval(interval);
    }
  }, [user]);

  const loadPingTrackings = async () => {
    if (!user) return;

    const { data: trackingsData } = await supabase
      .from('mailing_ping_tracking')
      .select(`
        *,
        recipient:mailing_recipients!mailing_ping_tracking_mailing_recipient_id_fkey(
          *,
          contact:contacts(*),
          mailing:mailings(*),
          sender_email:emails(email)
        )
      `)
      .order('created_at', { ascending: false });

    if (trackingsData) {
      const userTrackings = trackingsData.filter(
        (t) => t.recipient?.mailing?.user_id === user.id
      );
      setPingTrackings(userTrackings);
    }

    setLoading(false);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'response_received':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            <CheckCircle className="w-3 h-3" />
            Получен ответ
          </span>
        );
      case 'ping_sent':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
            <Send className="w-3 h-3" />
            Отправлено пинг письмо
          </span>
        );
      case 'awaiting_response':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
            <Clock className="w-3 h-3" />
            Ожидается ответ
          </span>
        );
      case 'no_response':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
            <XCircle className="w-3 h-3" />
            Нет ответа
          </span>
        );
      default:
        return null;
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('ru-RU');
  };

  const calculateWaitTime = (initialDate: string, responseDate?: string | null) => {
    const start = new Date(initialDate);
    const end = responseDate ? new Date(responseDate) : new Date();
    const diffMs = end.getTime() - start.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    return `${diffDays} дн. ${diffHours} ч.`;
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Отслеживание ответов</h2>
        <p className="text-gray-600 dark:text-gray-400">
          Мониторинг получения ответов и автоматическая отправка пинг-писем
        </p>
      </div>

      {pingTrackings.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
          <Mail className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400">Нет отслеживаемых рассылок</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pingTrackings.map((tracking) => (
            <div
              key={tracking.id}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"
            >
              <div
                className="p-5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                onClick={() => toggleExpand(tracking.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        {tracking.recipient?.mailing?.subject || 'Без темы'}
                      </h3>
                      {getStatusBadge(tracking.status)}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                      <p>Получатель: {tracking.recipient?.contact?.email}</p>
                      <p>Отправлено: {formatDate(tracking.initial_sent_at)}</p>
                      {tracking.response_received && tracking.response_received_at && (
                        <p className="text-green-600 dark:text-green-400">
                          Ответ получен: {formatDate(tracking.response_received_at)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="ml-4">
                    {expandedId === tracking.id ? (
                      <ChevronUp className="w-5 h-5 text-gray-500" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-500" />
                    )}
                  </div>
                </div>
              </div>

              {expandedId === tracking.id && (
                <div className="border-t border-gray-200 dark:border-gray-700 p-5 bg-gray-50 dark:bg-gray-900/50 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                      <h4 className="font-semibold text-gray-900 dark:text-white mb-3">
                        Информация об отправке
                      </h4>
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="text-gray-600 dark:text-gray-400">Дата первой отправки:</span>
                          <p className="text-gray-900 dark:text-white">{formatDate(tracking.initial_sent_at)}</p>
                        </div>
                        <div>
                          <span className="text-gray-600 dark:text-gray-400">Отправлено с:</span>
                          <p className="text-gray-900 dark:text-white">
                            {tracking.recipient?.sender_email?.email || 'Неизвестно'}
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-600 dark:text-gray-400">Время ожидания:</span>
                          <p className="text-gray-900 dark:text-white">
                            {calculateWaitTime(tracking.initial_sent_at, tracking.response_received_at)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                      <h4 className="font-semibold text-gray-900 dark:text-white mb-3">
                        Статус ответа
                      </h4>
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="text-gray-600 dark:text-gray-400">Ответ получен:</span>
                          <p className="text-gray-900 dark:text-white">
                            {tracking.response_received ? 'Да' : 'Нет'}
                          </p>
                        </div>
                        {tracking.response_received && tracking.response_received_at && (
                          <div>
                            <span className="text-gray-600 dark:text-gray-400">Дата получения:</span>
                            <p className="text-gray-900 dark:text-white">
                              {formatDate(tracking.response_received_at)}
                            </p>
                          </div>
                        )}
                        {!tracking.response_received && (
                          <div>
                            <span className="text-gray-600 dark:text-gray-400">Ожидается до:</span>
                            <p className="text-gray-900 dark:text-white">
                              {formatDate(
                                new Date(
                                  new Date(tracking.initial_sent_at).getTime() + 3 * 24 * 60 * 60 * 1000
                                ).toISOString()
                              )}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {tracking.ping_sent && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                      <h4 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                        <Send className="w-4 h-4" />
                        Информация о пинг-письме
                      </h4>
                      <div className="space-y-3">
                        <div>
                          <span className="text-sm text-gray-600 dark:text-gray-400">Дата отправки:</span>
                          <p className="text-sm text-gray-900 dark:text-white">
                            {tracking.ping_sent_at && formatDate(tracking.ping_sent_at)}
                          </p>
                        </div>
                        {tracking.ping_subject && (
                          <div>
                            <span className="text-sm text-gray-600 dark:text-gray-400">Тема:</span>
                            <p className="text-sm text-gray-900 dark:text-white">{tracking.ping_subject}</p>
                          </div>
                        )}
                        {tracking.ping_text_content && (
                          <div>
                            <span className="text-sm text-gray-600 dark:text-gray-400">Текст письма:</span>
                            <div className="mt-1 p-3 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-600 max-h-32 overflow-y-auto">
                              <pre className="text-xs text-gray-900 dark:text-white whitespace-pre-wrap">
                                {tracking.ping_text_content}
                              </pre>
                            </div>
                          </div>
                        )}
                        {tracking.ping_html_content && (
                          <div>
                            <span className="text-sm text-gray-600 dark:text-gray-400">HTML письма:</span>
                            <div className="mt-1 p-3 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-600 max-h-32 overflow-y-auto">
                              <pre className="text-xs text-gray-900 dark:text-white whitespace-pre-wrap font-mono">
                                {tracking.ping_html_content}
                              </pre>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
