import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Home, BookOpen, Sparkles, RotateCcw, HelpCircle, LogOut, Shield, ClipboardList, User, Settings } from 'lucide-react';
import { MainMode } from '../types';

interface SideMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onModeSelect: (mode: MainMode) => void;
  onShowDashboard: () => void;
  onSignOut: () => void;
  onTriggerAdvice: () => void;
  userEmail: string | null;
  onEditProfile?: () => void;
  onSettings?: () => void;
}

export const SideMenu: React.FC<SideMenuProps> = ({
  isOpen,
  onClose,
  onModeSelect,
  onShowDashboard,
  onSignOut,
  onTriggerAdvice,
  userEmail,
  onEditProfile,
  onSettings
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black z-40"
          />

          {/* Drawer Content */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 20 }}
            className="fixed top-0 right-0 h-full w-72 bg-white shadow-2xl z-50 flex flex-col border-l border-teal-50"
          >
            <div className="p-6 bg-teal-50/50 border-b border-teal-100 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="font-bold text-teal-900 text-lg">メニュー</span>
                {userEmail && (
                  <span className="text-[11px] text-teal-600 font-mono truncate max-w-[200px]" title={userEmail}>
                    {userEmail}
                  </span>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-1 border border-teal-100 rounded-full hover:bg-teal-100/50 text-teal-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="flex-1 p-6 overflow-y-auto">
              <ul className="space-y-3">
                <li>
                  <button
                    onClick={() => {
                      onShowDashboard();
                      onClose();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-gray-700 hover:bg-teal-50 hover:text-teal-700 transition-all text-left"
                  >
                    <Home className="w-5 h-5 text-teal-600" />
                    ホーム (ダッシュボード)
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => {
                      if (onSettings) onSettings();
                      onClose();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-gray-700 hover:bg-teal-50 hover:text-teal-700 transition-all text-left"
                  >
                    <Settings className="w-5 h-5 text-teal-600" />
                    設定
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => {
                      onModeSelect('past');
                      onClose();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-gray-700 hover:bg-teal-50 hover:text-teal-700 transition-all text-left"
                  >
                    <BookOpen className="w-5 h-5 text-teal-600" />
                    過去問演習
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => {
                      onModeSelect('ai');
                      onClose();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-gray-700 hover:bg-teal-50 hover:text-teal-700 transition-all text-left"
                  >
                    <Sparkles className="w-5 h-5 text-teal-600 animate-pulse" />
                    AI予想問題
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => {
                      onModeSelect('review');
                      onClose();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-gray-700 hover:bg-teal-50 hover:text-teal-700 transition-all text-left"
                  >
                    <RotateCcw className="w-5 h-5 text-teal-600" />
                    苦手克服
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => {
                      onModeSelect('report');
                      onClose();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-gray-700 hover:bg-teal-50 hover:text-teal-700 transition-all text-left"
                  >
                    <ClipboardList className="w-5 h-5 text-teal-600" />
                    レポート
                  </button>
                </li>
                {['admin@example.com'].includes(userEmail?.toLowerCase() || '') && (
                  <li>
                    <button
                      onClick={() => {
                        onModeSelect('admin');
                        onClose();
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-teal-800 bg-teal-50 hover:bg-teal-100 transition-all text-left border border-teal-200"
                    >
                      <Shield className="w-5 h-5 text-teal-700 animate-pulse" />
                      管理者レポート (卒論)
                    </button>
                  </li>
                )}
                <li>
                  <button
                    onClick={() => {
                      onTriggerAdvice();
                      onClose();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-white bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 transition-all text-left shadow-md shadow-teal-500/10"
                  >
                    <HelpCircle className="w-5 h-5" />
                    AI学習アドバイス
                  </button>
                </li>
              </ul>
            </nav>

            <div className="p-6 border-t border-teal-50 bg-gray-50/50">
              <button
                onClick={() => {
                  onSignOut();
                  onClose();
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-3.5 border-2 border-rose-100 hover:bg-rose-50 hover:border-rose-200 text-rose-600 rounded-xl font-bold transition-all"
              >
                <LogOut className="w-4 h-4" />
                ログアウト
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
