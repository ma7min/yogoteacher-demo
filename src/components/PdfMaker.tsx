import React, { useState, useEffect } from 'react';
import { ChevronLeft, Upload, Play, X, MousePointer2, FileText, BookOpen, Hand, PenLine, Eraser, Save, Loader2, Trash2, Sparkles, CheckCircle } from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import useMeasure from 'react-use-measure';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import { motion, AnimatePresence } from 'motion/react';

import { db, auth, storage, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, addDoc, getDocs, query, where, orderBy, serverTimestamp, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { saveFileLocal, getFileLocal, deleteFileLocal } from '../lib/indexedDb';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfMakerProps {
  onBack: () => void;
}

type Mode = 'upload' | 'workspace';

type Marker = {
  id: string;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

type Workspace = {
  id: string;
  userId?: string;
  title: string;
  fileUrl: string;
  fileName?: string;
  fileType: 'pdf' | 'image';
  markers: Marker[];
  createdAt: any;
  updatedAt: any;
  isPublic?: boolean;
  fileData?: string;
  authorName?: string;
};

// クライアント側で画像を1024px以下に縮小し、画質0.6のJPEGに圧縮してBase64を返す
const compressImage = (file: File, maxWidth = 1024, maxHeight = 1024, quality = 0.6): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedBase64);
      };
      img.onerror = (e) => reject(e);
    };
    reader.onerror = (e) => reject(e);
  });
};

// ファイル（PDF用）をそのままBase64エンコードする
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};

export default function PdfMaker({ onBack }: PdfMakerProps) {
  const [mode, setMode] = useState<Mode>('upload');
  const [tool, setTool] = useState<'draw' | 'erase' | 'study'>('draw');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | string | null>(null);
  const [fileType, setFileType] = useState<'pdf' | 'image' | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  
  const [markers, setMarkers] = useState<Marker[]>([]);
  
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [title, setTitle] = useState("無題のノート");
  const [savedWorkspaces, setSavedWorkspaces] = useState<Workspace[]>([]);
  const [isLoadingWorkspaces, setIsLoadingWorkspaces] = useState(true);

  // States for local storage file relink (bypassing Firebase Storage)
  const [needsRelink, setNeedsRelink] = useState(false);
  const [relinkWorkspace, setRelinkWorkspace] = useState<Workspace | null>(null);

  // 公開共有機能用
  const [isPublic, setIsPublic] = useState(false);
  const [activeTab, setActiveTab] = useState<'mine' | 'public'>('mine');
  const [publicWorkspaces, setPublicWorkspaces] = useState<Workspace[]>([]);
  const [isLoadingPublic, setIsLoadingPublic] = useState(false);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);

  // 現在のワークスペースの所有者（作成者）かどうかの判定
  const isOwner = !workspaceId || (
    savedWorkspaces.some(w => w.id === workspaceId) ||
    (publicWorkspaces.find(w => w.id === workspaceId)?.userId === auth?.currentUser?.uid)
  );

  useEffect(() => {
    fetchWorkspaces();
    fetchPublicWorkspaces();
  }, []);

  // Ctrl+Z Undo functionality for drawing markers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        mode === 'workspace' &&
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === 'z'
      ) {
        // Skip if user is actively editing a text input or textarea (to avoid breaking default text undo behavior)
        const activeTag = document.activeElement?.tagName;
        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
          return;
        }

        e.preventDefault();
        setMarkers(prev => {
          if (prev.length === 0) return prev;
          // Remove the last drawn marker
          return prev.slice(0, -1);
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mode]);

  const handleBackNavigation = () => {
    if (mode === 'workspace') {
      setMode('upload');
      setPdfFile(null);
      setImageSrc(null);
      setWorkspaceId(null);
      setTitle("無題のノート");
      setMarkers([]);
      // Refresh list to pull any updates
      fetchWorkspaces();
      fetchPublicWorkspaces();
    } else {
      onBack();
    }
  };

  const fetchWorkspaces = async () => {
    if (!auth?.currentUser) {
      setIsLoadingWorkspaces(false);
      return;
    }
    
    try {
      const q = query(
        collection(db, 'workspaces'),
        where('userId', '==', auth.currentUser.uid)
      );
      const snapshot = await getDocs(q);
      const workspaces = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Workspace[];
      
      // Sort client-side by updatedAt to avoid requiring a composite index
      workspaces.sort((a, b) => {
        const timeA = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : (a.updatedAt?.seconds ? a.updatedAt.seconds * 1000 : 0);
        const timeB = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : (b.updatedAt?.seconds ? b.updatedAt.seconds * 1000 : 0);
        return timeB - timeA;
      });

      setSavedWorkspaces(workspaces);
    } catch (error) {
      console.error("Failed to fetch workspaces:", error);
    } finally {
      setIsLoadingWorkspaces(false);
    }
  };

  const fetchPublicWorkspaces = async () => {
    setIsLoadingPublic(true);
    try {
      const q = query(
        collection(db, 'workspaces'),
        where('isPublic', '==', true)
      );
      const snapshot = await getDocs(q);
      const workspaces = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Workspace[];
      
      workspaces.sort((a, b) => {
        const timeA = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : (a.updatedAt?.seconds ? a.updatedAt.seconds * 1000 : 0);
        const timeB = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : (b.updatedAt?.seconds ? b.updatedAt.seconds * 1000 : 0);
        return timeB - timeA;
      });

      setPublicWorkspaces(workspaces);
    } catch (error) {
      console.error("Failed to fetch public workspaces:", error);
    } finally {
      setIsLoadingPublic(false);
    }
  };

  // Clean up Object URL to prevent memory leaks
  useEffect(() => {
    return () => {
      if (imageSrc) {
        URL.revokeObjectURL(imageSrc);
      }
    };
  }, [imageSrc]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    try {
      if (imageSrc && !imageSrc.startsWith('http')) {
        URL.revokeObjectURL(imageSrc);
      }
      setImageSrc(null);

      const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name);

      setOriginalFile(file);
      setTitle(file.name.replace(/\.[^/.]+$/, ""));
      setWorkspaceId(null);
      setIsPublic(false); // 新規ファイルアップロード時は一旦公開オフに

      if (isImage) {
        const url = URL.createObjectURL(file);
        setImageSrc(url);
        setFileType('image');
        setNumPages(1);
        setPdfFile(file);
        setMode('workspace');
        setMarkers([]);
      } else {
        setPdfFile(file);
        setFileType('pdf');
        setMode('workspace');
        setMarkers([]);
      }
    } catch (error) {
      console.error("File upload and parsing error:", error);
      alert("ファイルの読み込みに失敗しました。対応しているPDFまたは画像形式かご確認ください。");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveWorkspace = async () => {
    if (!auth?.currentUser) {
      alert("保存するにはログインが必要です。");
      return;
    }
    if (!db) {
      alert("データベースが初期化されていません。Firebaseプロジェクトが正しく初期化されているか、または設定ファイルをご確認ください。");
      return;
    }
    if (!originalFile && !workspaceId) {
      alert("保存するファイルが見つかりません。ファイルをアップロードしてから保存してください。");
      return;
    }

    setIsSaving(true);
    try {
      const fileName = originalFile ? originalFile.name : (savedWorkspaces.find(w => w.id === workspaceId)?.fileName || publicWorkspaces.find(w => w.id === workspaceId)?.fileName || "document");
      
      let authorName = auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || "匿名ユーザー";
      try {
        const savedProfile = localStorage.getItem(`user_profile_${auth.currentUser.uid}`);
        if (savedProfile) {
          const profile = JSON.parse(savedProfile);
          if (profile.diaryName) {
            authorName = profile.diaryName;
          }
        }
      } catch (e) {
        console.warn("Could not read diary name from local storage profile:", e);
      }

      let targetId = workspaceId;
      let existingDoc = savedWorkspaces.find(w => w.id === workspaceId) || publicWorkspaces.find(w => w.id === workspaceId);
      let currentFileUrl = existingDoc?.fileUrl || "";

      // 1. Create or update Firestore doc with metadata first
      const docData: any = {
        userId: auth.currentUser.uid,
        title: title || "無題のノート",
        fileName,
        fileType,
        markers,
        isPublic,
        authorName,
        updatedAt: serverTimestamp(),
      };

      if (workspaceId) {
        await updateDoc(doc(db, 'workspaces', workspaceId), docData);
      } else {
        const newDoc = await addDoc(collection(db, 'workspaces'), {
          ...docData,
          createdAt: serverTimestamp(),
        });
        targetId = newDoc.id;
        setWorkspaceId(targetId);
      }

      // 2. Determine if we need to upload a file to Firebase Storage
      let fileToUpload: Blob | null = null;
      if (originalFile) {
        fileToUpload = originalFile;
      } else if (isPublic && !currentFileUrl && targetId) {
        // Migration: If we are publishing a local-only note, get the blob from local IndexedDB and upload it
        fileToUpload = await getFileLocal(targetId);
      }

      // 3. Perform Firebase Storage upload if needed
      if (fileToUpload && targetId && storage) {
        const storagePath = `workspaces/${targetId}/${fileName}`;
        const storageRef = ref(storage, storagePath);
        
        // Upload bytes
        await uploadBytes(storageRef, fileToUpload);
        
        // Get URL
        currentFileUrl = await getDownloadURL(storageRef);
        
        // Update Firestore document with download URL and clear legacy Base64 fileData
        await updateDoc(doc(db, 'workspaces', targetId), {
          fileUrl: currentFileUrl,
          fileData: "" // Clear legacy Base64 data to keep firestore docs light
        });
      }

      // 4. Update state variables
      const finalDoc = {
        ...docData,
        id: targetId,
        fileUrl: currentFileUrl,
        fileData: "",
        updatedAt: new Date()
      } as Workspace;

      setSavedWorkspaces(prev => {
        const index = prev.findIndex(w => w.id === targetId);
        if (index >= 0) {
          return prev.map(w => w.id === targetId ? finalDoc : w);
        } else {
          return [finalDoc, ...prev];
        }
      });

      if (isPublic) {
        setPublicWorkspaces(prev => {
          const index = prev.findIndex(w => w.id === targetId);
          if (index >= 0) {
            return prev.map(w => w.id === targetId ? finalDoc : w);
          } else {
            return [finalDoc, ...prev];
          }
        });
      } else {
        setPublicWorkspaces(prev => prev.filter(w => w.id !== targetId));
      }

      // 5. Save file body to local IndexedDB for fallback loading on current device
      if (originalFile && targetId) {
        await saveFileLocal(targetId, originalFile);
        setOriginalFile(null); // clear state once saved
      }
      
      setShowSuccessPopup(true);
    } catch(e: any) {
      console.error("Save workspace error details:", e);
      alert("保存に失敗しました。詳細エラー:\n" + (e?.message || String(e)) + "\n\n※Firestore / Cloud Storageが有効化され、適切なアクセス権限があることをご確認ください。");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyWorkspace = async (targetWs?: Workspace) => {
    if (!auth?.currentUser) {
      alert("コピーするにはログインが必要です。");
      return;
    }
    if (!db) {
      alert("データベースが初期化されていません。");
      return;
    }

    const ws = targetWs || savedWorkspaces.find(w => w.id === workspaceId) || publicWorkspaces.find(w => w.id === workspaceId);
    if (!ws) {
      alert("コピーするワークスペースが見つかりません。");
      return;
    }

    setIsLoading(true);
    try {
      let diaryName = auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || "匿名ユーザー";
      try {
        const savedProfile = localStorage.getItem(`user_profile_${auth.currentUser.uid}`);
        if (savedProfile) {
          const profile = JSON.parse(savedProfile);
          if (profile.diaryName) {
            diaryName = profile.diaryName;
          }
        }
      } catch (e) {
        console.warn("Could not read diary name from local storage profile during copy:", e);
      }

      const docData = {
        userId: auth.currentUser.uid,
        title: `${ws.title} (コピー)`,
        fileName: ws.fileName || "document",
        fileType: ws.fileType,
        markers: ws.markers || [],
        isPublic: false,
        authorName: diaryName,
        fileUrl: ws.fileUrl || "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const newDocRef = await addDoc(collection(db, 'workspaces'), docData);
      const newId = newDocRef.id;

      if (ws.fileUrl) {
        try {
          const res = await fetch(`/api/proxy?url=${encodeURIComponent(ws.fileUrl)}`);
          if (res.ok) {
            const blob = await res.blob();
            await saveFileLocal(newId, blob);
          }
        } catch (e) {
          console.warn("Could not cache file locally for copied workspace:", e);
        }
      }

      alert("マイノートにコピーしました！🎉 コピーしたノートは自由に編集・マーカー操作が可能です。");
      
      await fetchWorkspaces();
      
      const createdWorkspace: Workspace = {
        id: newId,
        userId: auth.currentUser.uid,
        title: `${ws.title} (コピー)`,
        fileName: ws.fileName || "document",
        fileType: ws.fileType,
        markers: ws.markers || [],
        isPublic: false,
        authorName: diaryName,
        fileUrl: ws.fileUrl || "",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      handleLoadWorkspace(createdWorkspace);
      setMode('workspace');
    } catch (e: any) {
      console.error("Failed to copy workspace:", e);
      alert("コピーの作成に失敗しました: " + (e?.message || String(e)));
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadWorkspace = async (workspace: Workspace) => {
    setIsLoading(true);
    try {
      if (imageSrc && !imageSrc.startsWith('http')) {
        URL.revokeObjectURL(imageSrc);
      }
      
      setWorkspaceId(workspace.id);
      setTitle(workspace.title);
      setFileType(workspace.fileType);
      setMarkers(workspace.markers || []);
      setIsPublic(workspace.isPublic || false);

      // Set default tool depending on ownership: Owner can draw/edit, others can only study
      if (workspace.userId === auth?.currentUser?.uid) {
        setTool('draw');
      } else {
        setTool('study');
      }
      
      // 1. Prioritize Cloud fileUrl if available (allows seamless cross-device sharing)
      if (workspace.fileUrl) {
        setOriginalFile(null);
        setNeedsRelink(false);
        setRelinkWorkspace(null);

        const proxyUrl = `/api/proxy?url=${encodeURIComponent(workspace.fileUrl)}`;

        if (workspace.fileType === 'image') {
          setImageSrc(proxyUrl);
          setPdfFile(null);
          setNumPages(1);

          // Stash a copy in background local IndexedDB cache for offline/faster subsequent loads
          fetch(proxyUrl)
            .then(res => res.blob())
            .then(blob => saveFileLocal(workspace.id, blob))
            .catch(err => console.warn("Background cache error:", err));
        } else {
          // Bypass CORS for PDF rendering by routing through our internal local Express proxy
          setPdfFile(proxyUrl as any);
          setImageSrc(null);

          // Stash a copy in background local IndexedDB cache for offline/faster subsequent loads
          fetch(proxyUrl)
            .then(res => res.blob())
            .then(blob => saveFileLocal(workspace.id, blob))
            .catch(err => console.warn("Background cache error:", err));
        }
        setMode('workspace');
      }
      // 2. Fallback to legacy base64 data
      else if (workspace.fileData) {
        setOriginalFile(null);
        setNeedsRelink(false);
        setRelinkWorkspace(null);

        if (workspace.fileType === 'image') {
          setImageSrc(workspace.fileData);
          setPdfFile(null);
          setNumPages(1);
        } else {
          const base64Content = workspace.fileData.includes(',') ? workspace.fileData.split(',')[1] : workspace.fileData;
          const byteCharacters = atob(base64Content);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const pdfBlob = new Blob([byteArray], { type: 'application/pdf' });
          setPdfFile(pdfBlob as File);
          setImageSrc(null);
        }
        setMode('workspace');
      }
      // 3. Fallback to local IndexedDB
      else {
        const localBlob = await getFileLocal(workspace.id);
        
        if (localBlob) {
          setOriginalFile(null);
          setNeedsRelink(false);
          setRelinkWorkspace(null);

          if (workspace.fileType === 'image') {
            const url = URL.createObjectURL(localBlob);
            setImageSrc(url);
            setPdfFile(null);
            setNumPages(1);
          } else {
            setPdfFile(localBlob as File);
            setImageSrc(null);
          }
          setMode('workspace');
        } else {
          // If file blob is not found anywhere (e.g. other devices or cleared cache)
          setNeedsRelink(true);
          setRelinkWorkspace(workspace);
          setMode('upload');
        }
      }
    } catch (error) {
      console.error(error);
      alert("ファイルの読み込みに失敗しました。");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRelinkFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !relinkWorkspace) return;

    setIsLoading(true);
    try {
      const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name);
      const expectedType = relinkWorkspace.fileType;

      if ((expectedType === 'pdf' && isImage) || (expectedType === 'image' && !isImage)) {
        alert(`ファイル形式が一致しません。${expectedType === 'pdf' ? 'PDF' : '画像'}ファイルを選択してください。`);
        setIsLoading(false);
        return;
      }

      // Save to IndexedDB
      await saveFileLocal(relinkWorkspace.id, file);

      // Load normally
      if (isImage) {
        const url = URL.createObjectURL(file);
        setImageSrc(url);
        setFileType('image');
        setNumPages(1);
        setPdfFile(file);
      } else {
        setPdfFile(file);
        setFileType('pdf');
        setImageSrc(null);
      }

      setOriginalFile(null);
      setNeedsRelink(false);
      setRelinkWorkspace(null);
      setMode('workspace');
    } catch (error) {
      console.error(error);
      alert("ファイルのリンクに失敗しました。");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteWorkspace = async (id: string, fileUrl: string) => {
    if (!auth?.currentUser) return;
    if (!confirm("本当にこのノートを削除しますか？")) return;
    
    try {
      // 1. Delete document from Firestore
      await deleteDoc(doc(db, 'workspaces', id));
      
      // 2. Delete file from Firebase Storage if fileUrl exists
      if (fileUrl && storage) {
        try {
          const storageRef = ref(storage, fileUrl);
          await deleteObject(storageRef);
        } catch (storageError) {
          console.warn("Storage delete failed (it might have already been deleted or rules denied):", storageError);
        }
      }
      
      // 3. Delete from local IndexedDB
      try {
        await deleteFileLocal(id);
      } catch (localError) {
        console.warn("Local storage delete failed:", localError);
      }
      
      setSavedWorkspaces(prev => prev.filter(w => w.id !== id));
      setPublicWorkspaces(prev => prev.filter(w => w.id !== id));
      
      if (workspaceId === id) {
        setMode('upload');
        setWorkspaceId(null);
        setPdfFile(null);
        setImageSrc(null);
        setMarkers([]);
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `workspaces/${id}`);
    }
  };

  const handleAddMarker = (marker: Marker) => {
    setMarkers(prev => [...prev, marker]);
  };

  const handleRemoveMarker = (id: string) => {
    setMarkers(prev => prev.filter(m => m.id !== id));
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex items-center justify-between">
        <button
          onClick={handleBackNavigation}
          className="flex items-center text-gray-500 hover:text-gray-800 transition-colors font-bold cursor-pointer"
        >
          <ChevronLeft className="w-5 h-5 mr-1" />
          {mode === 'workspace' ? '選択画面に戻る' : 'ホームに戻る'}
        </button>
      </div>

      <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100">
        <div className="bg-slate-900 p-6 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black tracking-tight flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-teal-400" />
              自作問題作成 (参考書モード)
            </h2>
            <p className="text-slate-400 text-sm mt-1 font-medium">
              PDFや画像の上に直接マーカーを引いて、自分だけの暗記用参考書を作成できます。
            </p>
          </div>
        </div>

        <div className="p-6">
          {mode === 'upload' && (
            <div className="space-y-8">
              {needsRelink && relinkWorkspace ? (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-amber-100 text-amber-800 rounded-xl mt-0.5">
                      <FileText className="w-6 h-6 text-amber-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-lg text-amber-900">
                        「{relinkWorkspace.title}」の元のファイルが読み込めません
                      </h3>
                      {relinkWorkspace.isPublic ? (
                        <div className="text-sm text-amber-800 mt-2 space-y-2 leading-relaxed">
                          <p>
                            みんなの公開問題のファイルがクラウド（Firebase Storage）から見つからないか、読み込めません。
                          </p>
                          <div className="bg-white/80 p-3.5 rounded-xl border border-amber-200/60 text-xs text-amber-900 space-y-1.5 font-medium">
                            <p className="font-bold text-amber-950">💡 考えられる原因と対策：</p>
                            <ol className="list-decimal pl-4 space-y-1">
                              <li>
                                <strong>Firebase Storage が未有効：</strong> 新しい Firebase プロジェクトで「Storage」メニューが開かれ、初期設定されていない可能性があります。
                              </li>
                              <li>
                                <strong>古い設定データの残留：</strong> 以前の古い Firebase プロジェクトの時に作成された公開ノートであるため、現在のストレージにファイル実体が存在しません。
                              </li>
                              <li>
                                <strong>ストレージのルール：</strong> ログインユーザーのみ読み取り可能なルールになっている場合、ログイン状態が正常かご確認ください。
                              </li>
                            </ol>
                            <p className="mt-2 text-slate-500 font-normal">
                              ※ 作成者である場合は、Firebase Storage が有効であることを確認の上、一度ファイルを再アップロードして保存（みんなに公開）し直してください。
                            </p>
                          </div>
                          <p className="mt-2">
                            もし手元に同じファイル <strong className="text-amber-950 font-bold">「{relinkWorkspace.fileName || "元のPDF/画像"}」</strong> がある場合は、下のボタンから選択して読み込むことも可能です。
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-amber-700 mt-1 leading-relaxed">
                          この端末（ブラウザ）に元のファイルが見つかりません。別のデバイスで作成されたか、ブラウザのキャッシュがクリアされた可能性があります。
                          <br />
                          もう一度同じファイル <strong className="text-amber-900 font-bold">「{relinkWorkspace.fileName || "元のPDF/画像"}」</strong> を選択してください。マーカーデータは失われずに復元されます。
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <div className="relative flex items-center justify-center px-6 py-3 bg-teal-500 hover:bg-teal-600 active:bg-teal-700 text-white rounded-xl text-sm font-bold transition-colors cursor-pointer text-center flex-1">
                      <input
                        type="file"
                        accept=".pdf,application/pdf,image/*"
                        onChange={handleRelinkFile}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        disabled={isLoading}
                      />
                      {isLoading ? (
                        <span className="flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          読み込み中...
                        </span>
                      ) : (
                        <span className="flex items-center justify-center gap-1.5">
                          <Upload className="w-4 h-4" />
                          ファイルを選択してリンクを復元
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setNeedsRelink(false);
                        setRelinkWorkspace(null);
                        setWorkspaceId(null);
                      }}
                      className="px-6 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-50 transition-colors"
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-24 border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer relative">
                  <input
                    type="file"
                    accept=".pdf,application/pdf,image/*"
                    onChange={handleFileUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    disabled={isLoading}
                  />
                  {isLoading ? (
                    <div className="flex flex-col items-center text-gray-500">
                      <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mb-4" />
                      <span className="font-bold">ファイルを読み込み中...</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center text-gray-500">
                      <Upload className="w-12 h-12 mb-4 text-teal-400" />
                      <span className="font-bold text-lg text-gray-700">PDFまたは画像をアップロード</span>
                      <span className="text-sm mt-2 text-center px-4">カメラで撮影したノートや教科書の写真もそのまま使えます</span>
                    </div>
                  )}
                </div>
              )}

              {auth?.currentUser && (
                <div className="space-y-4">
                  <div className="flex border-b border-gray-200">
                    <button
                      onClick={() => setActiveTab('mine')}
                      className={`py-2 px-4 font-bold text-sm transition-colors border-b-2 cursor-pointer ${
                        activeTab === 'mine'
                          ? 'border-teal-500 text-teal-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      マイノート ({savedWorkspaces.length})
                    </button>
                    <button
                      onClick={() => {
                        setActiveTab('public');
                        fetchPublicWorkspaces();
                      }}
                      className={`py-2 px-4 font-bold text-sm transition-colors border-b-2 cursor-pointer ${
                        activeTab === 'public'
                          ? 'border-teal-500 text-teal-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      みんなの公開問題 ({publicWorkspaces.length})
                    </button>
                  </div>

                  {activeTab === 'mine' ? (
                    <div>
                      {isLoadingWorkspaces ? (
                        <div className="flex justify-center py-8">
                          <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
                        </div>
                      ) : savedWorkspaces.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {savedWorkspaces.map(ws => (
                            <div key={ws.id} className="border border-gray-200 rounded-xl p-4 bg-white shadow-sm hover:shadow-md transition-shadow relative group">
                              <div className="flex items-start justify-between mb-2 gap-2">
                                <div className="flex-1 cursor-pointer min-w-0" onClick={() => handleLoadWorkspace(ws)}>
                                  <h4 className="font-bold text-gray-800 truncate pr-4 animate-pulse-subtle" title={ws.title}>{ws.title}</h4>
                                  <span className="text-xs text-gray-400 block mt-1">
                                    {ws.updatedAt?.toDate ? ws.updatedAt.toDate().toLocaleDateString() : '最近'}
                                  </span>
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteWorkspace(ws.id, ws.fileUrl);
                                  }}
                                  className="text-gray-400 hover:text-rose-500 transition-colors p-1 cursor-pointer"
                                  title="削除"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                              <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-1 mt-4 pt-3 border-t border-gray-50">
                                <div className="flex flex-wrap gap-1.5 items-center">
                                  <span className="inline-block px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-md font-medium uppercase tracking-wider">
                                    {ws.fileType}
                                  </span>
                                  {ws.isPublic && (
                                    <span className="inline-block px-2 py-1 bg-teal-100 text-teal-700 text-xs rounded-md font-medium">
                                      公開中
                                    </span>
                                  )}
                                </div>
                                <span className="text-xs text-teal-600 font-bold bg-teal-50 px-2 py-1 rounded-md whitespace-nowrap">
                                  マーカー: {ws.markers?.length || 0}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-gray-400 bg-gray-50 rounded-xl border border-gray-100">
                          保存されたマイノートはまだありません
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      {isLoadingPublic ? (
                        <div className="flex justify-center py-8">
                          <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
                        </div>
                      ) : publicWorkspaces.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {publicWorkspaces.map(ws => (
                            <div key={ws.id} className="border border-gray-200 rounded-xl p-4 bg-white shadow-sm hover:shadow-md transition-shadow relative group">
                              <div className="flex items-start justify-between mb-2 gap-2">
                                <div className="flex-1 cursor-pointer min-w-0" onClick={() => handleLoadWorkspace(ws)}>
                                  <h4 className="font-bold text-gray-800 truncate pr-4" title={ws.title}>{ws.title}</h4>
                                  <span className="text-xs text-gray-400 block mt-1">
                                    投稿者: <span className="text-gray-600 font-bold">{ws.authorName || "匿名ユーザー"}</span>
                                  </span>
                                </div>
                                {ws.userId === auth?.currentUser?.uid && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteWorkspace(ws.id, ws.fileUrl);
                                    }}
                                    className="text-gray-400 hover:text-rose-500 transition-colors p-1 cursor-pointer"
                                    title="削除"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-1 mt-4 pt-3 border-t border-gray-50">
                                <div className="flex flex-wrap gap-1.5 items-center min-w-0">
                                  <span className="inline-block px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-md font-medium uppercase tracking-wider">
                                    {ws.fileType}
                                  </span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleCopyWorkspace(ws);
                                    }}
                                    className="px-2 py-1 bg-teal-50 hover:bg-teal-100 text-teal-700 text-[10px] sm:text-xs rounded-md font-bold transition-colors flex items-center gap-1 cursor-pointer shrink-0"
                                    title="マイノートにコピーして編集できるようにします"
                                  >
                                    <Sparkles className="w-3.5 h-3.5 text-teal-500 animate-spin-slow" />
                                    コピーして学習
                                  </button>
                                </div>
                                <span className="text-xs text-teal-600 font-bold bg-teal-50 px-2 py-1 rounded-md whitespace-nowrap">
                                  マーカー: {ws.markers?.length || 0}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-gray-400 bg-gray-50 rounded-xl border border-gray-100">
                          他者が公開した問題はまだありません
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {mode !== 'upload' && (
            <div className="space-y-6">
              {/* Toolbars */}
              {mode === 'workspace' && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-teal-50 p-4 rounded-2xl border border-teal-100">
                  <div className="flex flex-col gap-2 w-full">
                    <span className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                      {tool === 'draw' && <><PenLine className="w-4 h-4 text-teal-600" />隠したい場所をドラッグ（なぞる）してマーカーを引いてください。引いた場所は見えなくなります。</>}
                      {tool === 'erase' && <><Eraser className="w-4 h-4 text-rose-600" />消したいマーカーをタップまたはドラッグで消去してください。</>}
                      {tool === 'study' && <><Hand className="w-4 h-4 text-teal-600" />マーカーをタップすると隠れた文字が見えます。画面のスクロールも可能です。</>}
                    </span>
                    <div className="flex flex-wrap items-center justify-between w-full gap-4">
                      {isOwner ? (
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <button
                            onClick={() => setTool('draw')}
                            className={`px-4 py-2 rounded-full text-sm font-bold flex items-center gap-1.5 transition-colors ${
                              tool === 'draw' ? 'bg-teal-500 text-white shadow-md' : 'bg-white text-teal-700 border border-teal-200 hover:bg-teal-100'
                            }`}
                          >
                            <PenLine className="w-4 h-4" />
                            マーカー
                          </button>
                          <button
                            onClick={() => setTool('erase')}
                            className={`px-4 py-2 rounded-full text-sm font-bold flex items-center gap-1.5 transition-colors ${
                              tool === 'erase' ? 'bg-rose-500 text-white shadow-md' : 'bg-white text-rose-700 border border-rose-200 hover:bg-rose-100'
                            }`}
                          >
                            <Eraser className="w-4 h-4" />
                            消しゴム
                          </button>
                          <button
                            onClick={() => setTool('study')}
                            className={`px-4 py-2 rounded-full text-sm font-bold flex items-center gap-1.5 transition-colors ${
                              tool === 'study' ? 'bg-teal-600 text-white shadow-md' : 'bg-white text-teal-700 border border-teal-200 hover:bg-teal-100'
                            }`}
                          >
                            <Hand className="w-4 h-4" />
                            学習・スクロール
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <button
                            disabled
                            className="px-4 py-2 rounded-full text-sm font-bold flex items-center gap-1.5 bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed"
                            title="他者の公開問題は編集できません。コピーを作成してください。"
                          >
                            <PenLine className="w-4 h-4" />
                            マーカー (閲覧専用)
                          </button>
                          <button
                            onClick={() => setTool('study')}
                            className={`px-4 py-2 rounded-full text-sm font-bold flex items-center gap-1.5 transition-colors ${
                              tool === 'study' ? 'bg-teal-600 text-white shadow-md' : 'bg-white text-teal-700 border border-teal-200 hover:bg-teal-100'
                            }`}
                          >
                            <Hand className="w-4 h-4" />
                            学習・スクロール
                          </button>
                          <button
                            onClick={() => handleCopyWorkspace()}
                            className="px-4 py-2 rounded-full text-sm font-bold flex items-center gap-1.5 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white shadow-md transition-all cursor-pointer animate-pulse"
                          >
                            <Sparkles className="w-4 h-4" />
                            コピーしてマイノートに保存・編集する 🌸
                          </button>
                        </div>
                      )}
                      
                      {isOwner ? (
                        <div className="flex flex-wrap items-center gap-3 mt-1">
                          <label className="flex items-center gap-1.5 text-sm font-bold text-slate-700 bg-white px-3 py-2 border border-teal-200 rounded-lg cursor-pointer hover:bg-teal-50 transition-colors">
                            <input
                              type="checkbox"
                              checked={isPublic}
                              onChange={(e) => setIsPublic(e.target.checked)}
                              className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500 cursor-pointer"
                            />
                            みんなに公開する
                          </label>
                          <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="ノートのタイトル"
                            className="px-3 py-2 text-sm border border-teal-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 w-48 bg-white font-bold"
                          />
                          <button
                            onClick={handleSaveWorkspace}
                            disabled={isSaving}
                            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-bold flex items-center gap-2 transition-colors disabled:opacity-50 whitespace-nowrap cursor-pointer"
                          >
                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            保存
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 bg-white border border-teal-200 px-4 py-2 rounded-xl text-xs font-bold text-teal-700 shadow-sm mt-1">
                          <span className="w-2 h-2 bg-teal-500 rounded-full animate-pulse" />
                          <span>閲覧・学習中 (作成者: {publicWorkspaces.find(w => w.id === workspaceId)?.authorName || "他ユーザー"})</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Document Viewer Canvas (PDF or Image) */}
              <div className="space-y-6 bg-gray-100 p-4 sm:p-8 rounded-2xl shadow-inner border border-gray-200 overflow-x-auto">
                {fileType === 'image' && imageSrc && Array.from({ length: numPages }).map((_, i) => (
                  <PdfPage 
                    key={i}
                    imageSrc={imageSrc}
                    fileType={fileType}
                    pageIndex={i}
                    mode={mode}
                    tool={tool}
                    markers={markers}
                    onAddMarker={handleAddMarker}
                    onRemoveMarker={handleRemoveMarker}
                  />
                ))}
                
                {fileType === 'pdf' && pdfFile && (
                  <Document 
                    file={pdfFile} 
                    onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                    className="flex flex-col gap-6"
                    loading={
                      <div className="flex flex-col items-center py-12 text-gray-500">
                        <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mb-4" />
                        <span className="font-bold">PDFを読み込み中...</span>
                      </div>
                    }
                  >
                    {Array.from({ length: numPages }).map((_, i) => (
                      <PdfPage 
                        key={i}
                        fileType={fileType}
                        pageIndex={i}
                        mode={mode}
                        tool={tool}
                        markers={markers}
                        onAddMarker={handleAddMarker}
                        onRemoveMarker={handleRemoveMarker}
                      />
                    ))}
                  </Document>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* かわいい保存完了ポップアップ */}
      <AnimatePresence>
        {showSuccessPopup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* 背景のオーバーレイ */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSuccessPopup(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            
            {/* ポップアップ本体 */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ 
                scale: 1, 
                opacity: 1, 
                y: 0,
                transition: { type: "spring", damping: 15, stiffness: 100 }
              }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="relative bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl border-4 border-pink-100 text-center overflow-hidden"
            >
              {/* かわいいパステル装飾サークル */}
              <div className="absolute -top-10 -left-10 w-24 h-24 bg-pink-50 rounded-full -z-10 opacity-60" />
              <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-teal-50 rounded-full -z-10 opacity-60" />
              
              {/* キラキラ・チェックアイコン */}
              <div className="relative flex justify-center mb-5">
                <div className="absolute -top-2 -left-2 text-pink-400 animate-bounce delay-75">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div className="absolute top-8 -right-2 text-amber-400 animate-pulse">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="bg-gradient-to-tr from-pink-400 to-teal-400 p-4 rounded-full text-white shadow-lg animate-in zoom-in-50 duration-300">
                  <CheckCircle className="w-10 h-10" />
                </div>
              </div>

              <h3 className="text-xl font-black text-slate-800 tracking-tight flex items-center justify-center gap-1">
                保存に成功しました！🌸
              </h3>
              
              <p className="text-slate-500 text-sm mt-3 font-medium leading-relaxed">
                作成した自作問題が「マイノート」に安全に保存されました！これでいつでも暗記テストを始められます。
              </p>

              {/* 保存された問題のメタデータ表示 (親切設計) */}
              <div className="mt-5 p-3.5 bg-slate-50 rounded-2xl border border-slate-100 text-left space-y-1.5 text-xs font-semibold text-slate-600">
                <div className="flex justify-between items-center">
                  <span>タイトル:</span>
                  <span className="text-slate-800 truncate max-w-[180px]">{title || "無題のノート"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>マーク箇所:</span>
                  <span className="bg-teal-100 text-teal-800 px-2 py-0.5 rounded-full text-[10px]">{markers.length} 箇所</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>公開設定:</span>
                  <span>{isPublic ? "🌐 みんなに公開" : "🔒 自分のみ"}</span>
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-2">
                <button
                  onClick={() => setShowSuccessPopup(false)}
                  className="w-full py-3 bg-gradient-to-r from-pink-400 to-rose-400 hover:from-pink-500 hover:to-rose-500 text-white font-black rounded-2xl shadow-md active:scale-[0.98] transition-all cursor-pointer text-sm"
                >
                  OK
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------
// PdfPage Component: Renders a single PDF page with drawing overlay
// ---------------------------------------------------------
function PdfPage({ 
  imageSrc,
  fileType,
  pageIndex, 
  mode,
  tool,
  markers, 
  onAddMarker, 
  onRemoveMarker,
}: any) {
  const [ref, bounds] = useMeasure();
  
  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentPos, setCurrentPos] = useState({ x: 0, y: 0 });
  
  // Track revealed markers in study mode
  const [revealedMarkers, setRevealedMarkers] = useState<Record<string, boolean>>({});

  const handleMouseDown = (e: React.MouseEvent) => {
    if (mode !== 'workspace' || tool !== 'draw') return;
    
    const target = e.target as HTMLElement;
    
    // Ignore clicks on existing markers
    if (target.closest('.marker-container')) return;

    // If it's a PDF and they clicked on text, let default selection happen
    if (fileType === 'pdf' && target.closest('.react-pdf__Page__textContent')) {
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    setStartPos({ x, y });
    setCurrentPos({ x, y });
    setIsDrawing(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing || mode !== 'workspace' || tool !== 'draw') return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    setCurrentPos({ x, y });
  };

  const handleMouseUp = () => {
    if (mode !== 'workspace' || tool !== 'draw') return;

    if (fileType === 'pdf') {
      const selection = window.getSelection();
      if (selection && selection.toString().trim().length > 0 && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const rects = Array.from(range.getClientRects());
        
        const containerRect = document.getElementById(`pdf-page-${pageIndex}`)?.getBoundingClientRect();
        
        if (containerRect) {
          const newMarkers: Marker[] = [];
          
          rects.forEach(rect => {
            if (
              rect.top < containerRect.bottom &&
              rect.bottom > containerRect.top &&
              rect.left < containerRect.right &&
              rect.right > containerRect.left
            ) {
              const x = ((rect.left - containerRect.left) / containerRect.width) * 100;
              const y = ((rect.top - containerRect.top) / containerRect.height) * 100;
              const width = (rect.width / containerRect.width) * 100;
              const height = (rect.height / containerRect.height) * 100;
              
              if (width > 0 && height > 0) {
                newMarkers.push({
                  id: Date.now().toString() + Math.random(),
                  pageIndex,
                  x,
                  y,
                  width,
                  height,
                });
              }
            }
          });

          if (newMarkers.length > 0) {
            newMarkers.forEach(m => onAddMarker(m));
            selection.removeAllRanges();
          }
        }
      }
    }

    if (!isDrawing) return;
    setIsDrawing(false);

    const x = Math.min(startPos.x, currentPos.x);
    const y = Math.min(startPos.y, currentPos.y);
    const width = Math.abs(currentPos.x - startPos.x);
    const height = Math.abs(currentPos.y - startPos.y);

    if (width > 1 && height > 1) {
      const newMarker: Marker = {
        id: Date.now().toString(),
        pageIndex,
        x,
        y,
        width,
        height,
      };
      onAddMarker(newMarker);
    }
  };
  
  const handleTouchStart = (e: React.TouchEvent) => {
    if (mode !== 'workspace' || tool !== 'draw') return;
    
    const target = e.target as HTMLElement;
    if (target.closest('.marker-container')) return;

    if (fileType === 'pdf' && target.closest('.react-pdf__Page__textContent')) {
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    
    const touch = e.touches[0];
    const x = ((touch.clientX - rect.left) / rect.width) * 100;
    const y = ((touch.clientY - rect.top) / rect.height) * 100;
    
    setStartPos({ x, y });
    setCurrentPos({ x, y });
    setIsDrawing(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDrawing || mode !== 'workspace' || tool !== 'draw') return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    
    const touch = e.touches[0];
    const x = Math.max(0, Math.min(100, ((touch.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((touch.clientY - rect.top) / rect.height) * 100));
    setCurrentPos({ x, y });
  };

  const handleTouchEnd = () => {
    handleMouseUp();
  };
  
  const toggleMarker = (id: string) => {
    if (tool !== 'study') return;
    setRevealedMarkers(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  return (
    <div 
      ref={ref}
      id={`pdf-page-${pageIndex}`}
      className={`relative w-full min-w-[800px] shadow-lg bg-white overflow-hidden ${mode === 'workspace' && tool === 'draw' && fileType === 'image' ? 'cursor-crosshair touch-none select-none disable-text-layer' : ''} ${mode === 'workspace' && tool === 'erase' ? 'cursor-cell touch-none select-none disable-text-layer' : ''}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {fileType === 'image' && imageSrc && (
        <img src={imageSrc} className="block w-full h-auto select-none" alt="Document page" draggable={false} />
      )}
      
      {fileType === 'pdf' && (
        <div className="w-full">
          <Page 
            pageNumber={pageIndex + 1} 
            renderTextLayer={true} 
            renderAnnotationLayer={false}
            width={bounds.width > 0 ? bounds.width : undefined}
            scale={4}
            devicePixelRatio={Math.max(window.devicePixelRatio || 1, 4)}
            loading={
              <div className="w-full aspect-[1/1.414] bg-white flex items-center justify-center text-gray-400">
                ページ読み込み中...
              </div>
            }
          />
          <style>{`
            .disable-text-layer .react-pdf__Page__textContent {
              pointer-events: none !important;
              user-select: none !important;
            }
            .react-pdf__Page__canvas {
              max-width: 100% !important;
              height: auto !important;
            }
            .react-pdf__Page {
              max-width: 100% !important;
            }
            
          `}</style>
        </div>
      )}
      
      {/* Drawing preview box */}
      {isDrawing && tool === 'draw' && (
        <div 
          className="absolute bg-teal-500/80 border-2 border-teal-600 pointer-events-none z-10"
          style={{
            left: `${Math.min(startPos.x, currentPos.x)}%`,
            top: `${Math.min(startPos.y, currentPos.y)}%`,
            width: `${Math.abs(currentPos.x - startPos.x)}%`,
            height: `${Math.abs(currentPos.y - startPos.y)}%`,
          }}
        />
      )}

      {/* Actual Markers */}
      {markers.filter((m: Marker) => m.pageIndex === pageIndex).map((m: Marker) => {
        const isRevealed = revealedMarkers[m.id];
        
        return (
          <div 
            key={m.id} 
            className="absolute marker-container group transition-all duration-200 z-10"
            style={{ 
              left: `${m.x}%`, 
              top: `${m.y}%`, 
              width: `${m.width}%`, 
              height: `${m.height}%`,
            }} 
            onClick={(e) => {
              if (tool === 'study') {
                e.stopPropagation();
                toggleMarker(m.id);
              } else if (tool === 'erase') {
                e.stopPropagation();
                onRemoveMarker(m.id);
              }
            }}
            onMouseEnter={(e) => {
              if (tool === 'erase' && e.buttons === 1) {
                onRemoveMarker(m.id);
              }
            }}
            onMouseDown={(e) => {
              if (tool === 'erase') {
                e.stopPropagation();
                onRemoveMarker(m.id);
              }
            }}
            onTouchStart={(e) => {
              if (tool === 'erase') {
                e.stopPropagation();
                onRemoveMarker(m.id);
              }
            }}
          >
            <div 
              className={`w-full h-full transition-all duration-200 ${
                isRevealed && tool === 'study'
                  ? 'bg-teal-200/20 border border-teal-300/30 mix-blend-multiply' 
                  : 'bg-teal-500 shadow-sm'
              } ${tool === 'study' ? 'cursor-pointer' : ''} ${tool === 'erase' ? 'hover:bg-rose-400 hover:border-rose-500 cursor-cell' : ''}`}
            >
              {tool === 'erase' && (
                <div className="absolute -top-3 -right-3 bg-rose-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-md z-40">
                  <X className="w-3 h-3" />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
