import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Bell, Info, Loader2, Trash2, ShieldAlert } from 'lucide-react';
import { db, isFirebaseMock } from '../lib/firebase';
import { collection, doc, deleteDoc, onSnapshot } from 'firebase/firestore';

interface NotificationDropdownProps {
  onClose: () => void;
  userEmail: string | null;
  onOpenAdminMode?: () => void;
}

export const NotificationDropdown: React.FC<NotificationDropdownProps> = ({ onClose, userEmail, onOpenAdminMode }) => {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const adminEmails = ['parakeetpp@gmail.com', 'm0725ishikawa@gmail.com', '23113041@kamakura-u.ac.jp'];
  const isAdmin = adminEmails.includes(userEmail?.toLowerCase() || '');

  useEffect(() => {
    if (isFirebaseMock || !db) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(collection(db, 'app_updates'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        list.push({
          id: doc.id,
          title: data.title || '',
          text: data.text || '',
          date: data.date || '',
          createdAt: data.createdAt,
        });
      });
      
      // Client-side sort by createdAt desc
      list.sort((a, b) => {
        const tA = a.createdAt && typeof a.createdAt.toMillis === 'function'
          ? a.createdAt.toMillis()
          : (a.createdAt && typeof a.createdAt.toDate === 'function' ? a.createdAt.toDate().getTime() : Number(a.createdAt || 0));
        const tB = b.createdAt && typeof b.createdAt.toMillis === 'function'
          ? b.createdAt.toMillis()
          : (b.createdAt && typeof b.createdAt.toDate === 'function' ? b.createdAt.toDate().getTime() : Number(b.createdAt || 0));
        return tB - tA;
      });

      // Limit to 15 items
      setNotifications(list.slice(0, 15));
      setLoading(false);
    }, (error) => {
      console.warn("Firestoreからのお知らせ受信警告 (未ログイン初期状態など):", error);
      setNotifications([]);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!window.confirm("このお知らせを削除してもよろしいですか？")) return;
    try {
      if (db && !isFirebaseMock) {
        await deleteDoc(doc(db, 'app_updates', id));
      }
    } catch (err: any) {
      console.error("削除エラー:", err);
      alert(`削除に失敗しました: ${err.message || err}`);
    }
  };

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  return (
    <motion.div
      ref={dropdownRef}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-teal-50 overflow-hidden z-50 mr-4"
    >
      <div className="p-4 bg-teal-50 border-b border-teal-100 flex items-center justify-between">
        <h4 className="font-bold text-teal-800 flex items-center gap-2">
          <Bell className="w-4 h-4 text-teal-600 animate-bounce" />
          お知らせ・アップデート
        </h4>
        <span className="text-xs text-teal-500 font-medium">新着 {notifications.length}件</span>
      </div>
      <div className="max-h-80 overflow-y-auto divide-y divide-teal-50">
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-xs flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 text-teal-500 animate-spin" />
            <span>読込中...</span>
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-xs flex flex-col items-center justify-center gap-1.5 py-12">
            <Info className="w-5 h-5 text-teal-300 mx-auto" />
            <span>配信中のお知らせはありません。</span>
          </div>
        ) : (
          notifications.map((n) => (
            <div key={n.id} className="p-4 hover:bg-teal-50/30 transition-colors relative group">
              <p className="font-bold text-sm text-gray-800 mb-1 pr-6">{n.title}</p>
              <p className="text-xs text-gray-600 leading-relaxed">{n.text}</p>
              <p className="text-[10px] text-gray-400 mt-2 text-right font-semibold">{n.date}</p>
              
              {isAdmin && (
                <button
                  onClick={(e) => handleDelete(n.id, e)}
                  className="absolute top-2 right-2 p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-100 bg-rose-50 rounded-md transition-colors z-10"
                  title="削除 (管理者用)"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))
        )}
      </div>
      <div className="p-3 bg-gray-50 text-center border-t border-teal-50 flex items-center justify-between">
        {isAdmin && onOpenAdminMode ? (
          <button
            onClick={() => {
              onOpenAdminMode();
              onClose();
            }}
            className="text-[10px] text-teal-600 hover:text-teal-800 font-bold flex items-center gap-1 bg-teal-100/50 hover:bg-teal-100 px-2 py-1.5 rounded-lg transition-colors"
          >
            <ShieldAlert className="w-3 h-3" />
            管理画面から追加/編集
          </button>
        ) : (
          <div />
        )}
        <button
          onClick={onClose}
          className="text-xs text-gray-500 hover:text-gray-700 font-bold px-3 py-1.5"
        >
          閉じる
        </button>
      </div>
    </motion.div>
  );
};
