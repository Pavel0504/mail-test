import { useState } from 'react';
import { Users, FolderOpen } from 'lucide-react';
import { ContactsPage } from './ContactsPage';
import { ContactGroupsPage } from './ContactGroupsPage';
import { ContactGroupDetailPage } from './ContactGroupDetailPage';

type View = 'contacts' | 'groups' | 'group-detail';

export function ContactsWrapper() {
  const [currentView, setCurrentView] = useState<View>('contacts');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const handleOpenGroup = (groupId: string) => {
    setSelectedGroupId(groupId);
    setCurrentView('group-detail');
  };

  const handleBackToGroups = () => {
    setSelectedGroupId(null);
    setCurrentView('groups');
  };

  if (currentView === 'group-detail' && selectedGroupId) {
    return <ContactGroupDetailPage groupId={selectedGroupId} onBack={handleBackToGroups} onOpenSubgroup={handleOpenGroup} />;
  }

  return (
    <div>
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex gap-2 p-4">
          <button
            onClick={() => setCurrentView('contacts')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              currentView === 'contacts'
                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <Users className="w-5 h-5" />
            Контакты
          </button>
          <button
            onClick={() => setCurrentView('groups')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              currentView === 'groups'
                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <FolderOpen className="w-5 h-5" />
            Группы
          </button>
        </div>
      </div>

      {currentView === 'contacts' && <ContactsPage />}
      {currentView === 'groups' && <ContactGroupsPage onOpenGroup={handleOpenGroup} />}
    </div>
  );
}
