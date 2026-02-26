import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Camera, Package, Search, Trash2, AlertTriangle, CheckCircle2, 
  Loader2, RefreshCw, X, Clock, Calendar, Pill, ChevronRight, Settings, 
  User, PhoneCall, Layers, Save, BookOpen, HeartPulse, ChevronDown,
  MessageSquare, Send, Mic, Stethoscope, Zap, ZoomIn, ZoomOut, Upload, Folder,
  Check, ListChecks, Plus
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { GoogleGenAI } from "@google/genai";
import Markdown from 'react-markdown';
import { createClient } from '@supabase/supabase-js';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Utility ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Supabase Client ---
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// --- Gemini AI ---
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

// --- Types ---
interface Medicine {
  id: number;
  name: string;
  usage: string;
  simple_instructions: string;
  interaction_warning: string;
  category: string;
  expiry_date: string;
  image_url?: string;
  is_manual: boolean;
  is_taken: number;
  scanned_at: string;
}

interface MedicineGroup {
  id: number;
  group_name: string;
  purpose: string;
  ai_schedule: string;
  created_at: string;
  items: Medicine[];
}

interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

interface AdherenceRecord {
  item_id: number;
  type: 'medicine' | 'group';
  time_slot: string;
  date: string;
  status: number;
}

// --- Constants ---
const AI_SYSTEM_INSTRUCTION = `Bạn là "Trợ lý Y tế MedGuard" - chuyên gia dược phẩm AI.
Nhiệm vụ:
1. QUÉT THUỐC: Phân tích ảnh, trả về: Tên thuốc | Hướng dẫn | Cảnh báo nguy cơ | HSD | Nhóm. (Dùng dấu | để phân tách).
2. DỊCH THUỐC: Dịch toàn bộ nội dung ảnh sang tiếng Việt dễ hiểu.
3. TRIỆU CHỨNG: Tư vấn sơ bộ dựa trên triệu chứng, luôn khuyên đi khám bác sĩ.
4. GÓI THUỐC: Lập lịch trình uống thuốc khoa học (Sáng/Trưa/Chiều/Tối).
5. CHAT: Trả lời như một bác sĩ tận tâm, am hiểu kho thuốc của người dùng.
LƯU Ý: Tuyệt đối không chào hỏi rườm rà trong các chế độ quét. Trả lời bằng tiếng Việt.`;

export default function App() {
  const [activeTab, setActiveTab] = useState<'scan' | 'inventory' | 'groups' | 'schedule' | 'chat'>('scan');
  const [inventory, setInventory] = useState<Medicine[]>([]);
  const [groups, setGroups] = useState<MedicineGroup[]>([]);
  const [adherence, setAdherence] = useState<AdherenceRecord[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [settings, setSettings] = useState({ emergency_name: '', emergency_phone: '' });
  
  const [scanMode, setScanMode] = useState<'medicine' | 'symptom' | 'translate'>('medicine');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [groupForm, setGroupForm] = useState({ name: '', purpose: '' });
  const [isAnalyzingGroup, setIsAnalyzingGroup] = useState(false);
  const [expandedGroupId, setExpandedGroupId] = useState<number | null>(null);

  const [chatInput, setChatInput] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [selectedMedicineForChat, setSelectedMedicineForChat] = useState<Medicine | null>(null);
  
  const [showSOS, setShowSOS] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // --- Initialization ---
  useEffect(() => {
    fetchData();
    if (activeTab === 'scan') startCamera();
    return () => stopCamera();
  }, [activeTab]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const fetchData = async () => {
    try {
      const { data: inv } = await supabase.from('inventory').select('*').order('scanned_at', { ascending: false });
      setInventory(inv || []);

      const { data: grps } = await supabase.from('medicine_groups').select('*').order('created_at', { ascending: false });
      if (grps) {
        const fullGrps = await Promise.all(grps.map(async (g) => {
          const { data: items } = await supabase.from('group_items').select('medicine_id, inventory(*)').eq('group_id', g.id);
          return { ...g, items: items?.map((i: any) => i.inventory) || [] };
        }));
        setGroups(fullGrps);
      }

      const today = new Date().toISOString().split('T')[0];
      const { data: adh } = await supabase.from('adherence').select('*').eq('date', today);
      setAdherence(adh || []);

      const { data: chat } = await supabase.from('chat_history').select('*').order('timestamp', { ascending: true });
      setChatHistory(chat || []);

      const { data: sett } = await supabase.from('settings').select('*').eq('id', 1).single();
      if (sett) setSettings(sett);
    } catch (e) {
      console.error("Fetch error:", e);
    }
  };

  const showToast = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // --- Camera Logic ---
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (e) {
      showToast("Không thể mở camera", "error");
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
    const data = canvas.toDataURL('image/jpeg');
    setCapturedImage(data);
    stopCamera();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setCapturedImage(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  // --- AI Logic ---
  const analyzeMedicine = async (base64?: string, customPrompt?: string) => {
    const imgData = base64 || capturedImage;
    if (!imgData && !customPrompt) return;

    setIsAnalyzing(true);
    try {
      let prompt = "";
      if (scanMode === 'medicine') prompt = "Phân tích thuốc này. Trả về: Tên | Hướng dẫn | Cảnh báo | HSD | Nhóm.";
      else if (scanMode === 'symptom') prompt = "Dựa trên hình ảnh/triệu chứng này, hãy tư vấn sơ bộ.";
      else if (scanMode === 'translate') prompt = "Dịch toàn bộ nội dung trong ảnh sang tiếng Việt.";

      if (customPrompt) prompt = customPrompt;

      const parts: any[] = [{ text: prompt }];
      if (imgData) {
        parts.push({
          inlineData: {
            mimeType: "image/jpeg",
            data: imgData.split(',')[1]
          }
        });
      }

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: { parts },
        config: { systemInstruction: AI_SYSTEM_INSTRUCTION }
      });

      const text = response.text || "";
      
      if (scanMode === 'translate') {
        setTranslatedText(text);
      } else if (scanMode === 'medicine') {
        const resultParts = text.split('|').map(p => p.trim());
        if (resultParts.length >= 5) {
          setAnalysisResult({
            name: resultParts[0],
            usage: resultParts[1],
            expiry_date: resultParts[3],
            simple_instructions: resultParts[1],
            interaction_warning: resultParts[2],
            category: resultParts[4],
            is_manual: false
          });
        } else {
          showToast("AI không thể phân tích rõ, vui lòng thử lại", "warning");
        }
      } else {
        // Symptom mode or other
        setTranslatedText(text);
      }
    } catch (error) {
      showToast("Lỗi phân tích AI", "error");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleChat = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() && !selectedMedicineForChat) return;

    const userMessage = selectedMedicineForChat 
      ? `[Hỏi về thuốc: ${selectedMedicineForChat.name}] ${chatInput}`
      : chatInput;
    
    const newUserMsg: ChatMessage = { role: 'user', content: userMessage };
    setChatHistory(prev => [...prev, newUserMsg]);
    setChatInput('');
    setSelectedMedicineForChat(null);
    setIsSendingChat(true);

    try {
      await supabase.from('chat_history').insert([{ ...newUserMsg, timestamp: new Date().toISOString() }]);

      const inventoryContext = inventory.map(i => `${i.name}: ${i.usage}`).join('\n');
      const fullPrompt = `Kho thuốc người dùng:\n${inventoryContext}\n\nLịch sử chat:\n${chatHistory.slice(-5).map(h => `${h.role}: ${h.content}`).join('\n')}\nUser: ${userMessage}`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: fullPrompt,
        config: { systemInstruction: AI_SYSTEM_INSTRUCTION }
      });

      const modelMsg: ChatMessage = { role: 'model', content: response.text || "Tôi không thể trả lời lúc này." };
      setChatHistory(prev => [...prev, modelMsg]);
      await supabase.from('chat_history').insert([{ ...modelMsg, timestamp: new Date().toISOString() }]);
    } catch (error) {
      showToast("Lỗi gửi tin nhắn", "error");
    } finally {
      setIsSendingChat(false);
    }
  };

  const createGroupFromSelection = async () => {
    if (selectedIds.length === 0 || !groupForm.name) return;
    setIsAnalyzingGroup(true);

    try {
      const selectedMeds = inventory.filter(i => selectedIds.includes(i.id));
      const medList = selectedMeds.map(b => b.name).join(', ');
      const prompt = `Lập lịch trình uống thuốc cho gói "${groupForm.name}" gồm: ${medList}. CHỈ trả về danh sách thuốc, lịch trình Sáng/Trưa/Chiều/Tối.`;
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: { systemInstruction: AI_SYSTEM_INSTRUCTION }
      });

      const { data: group, error: gError } = await supabase
        .from('medicine_groups')
        .insert([{ 
          group_name: groupForm.name, 
          purpose: groupForm.purpose, 
          ai_schedule: response.text,
          created_at: new Date().toISOString()
        }])
        .select();

      if (gError) throw gError;

      const groupId = group[0].id;
      const groupItems = selectedIds.map(id => ({ group_id: groupId, medicine_id: id }));
      await supabase.from('group_items').insert(groupItems);

      showToast("Đã tạo gói thuốc thành công!");
      setSelectedIds([]);
      setSelectionMode(false);
      setGroupForm({ name: '', purpose: '' });
      setIsCreatingGroup(false);
      fetchData();
      setActiveTab('groups');
    } catch (error) {
      showToast("Lỗi tạo gói", "error");
    } finally {
      setIsAnalyzingGroup(false);
    }
  };

  const toggleAdherence = async (itemId: number, type: 'medicine' | 'group', timeSlot: string) => {
    const today = new Date().toISOString().split('T')[0];
    const current = adherence.find(a => a.item_id === itemId && a.type === type && a.time_slot === timeSlot && a.date === today);
    const newStatus = current?.status === 1 ? 0 : 1;
    
    try {
      await supabase.from('adherence').upsert({ 
        item_id: itemId, type, time_slot: timeSlot, date: today, status: newStatus 
      }, { onConflict: 'item_id,type,time_slot,date' });
      fetchData();
    } catch (e) {
      showToast("Lỗi cập nhật", "error");
    }
  };

  const filteredInventory = useMemo(() => {
    return inventory.filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [inventory, searchQuery]);

  // --- Render Helpers ---
  const renderSchedule = () => {
    const slots = ['Sáng', 'Trưa', 'Chiều', 'Tối'];
    const today = new Date().toISOString().split('T')[0];

    return (
      <div className="h-full flex flex-col p-4 gap-6 overflow-y-auto custom-scrollbar">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-800">Lịch trình hôm nay</h2>
          <Calendar className="w-6 h-6 text-emerald-600" />
        </div>

        {slots.map(slot => (
          <div key={slot} className="space-y-3">
            <div className="flex items-center gap-2 text-emerald-600">
              <Clock className="w-4 h-4" />
              <h3 className="font-bold uppercase text-xs tracking-widest">{slot}</h3>
            </div>
            <div className="space-y-2">
              {inventory.filter(i => !i.is_taken).map(item => (
                <div key={item.id} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-sm text-slate-800">{item.name}</h4>
                    <p className="text-[10px] text-slate-400">{item.usage}</p>
                  </div>
                  <button 
                    onClick={() => toggleAdherence(item.id, 'medicine', slot)}
                    className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                      adherence.find(a => a.item_id === item.id && a.type === 'medicine' && a.time_slot === slot && a.date === today)?.status === 1
                        ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100'
                        : 'bg-slate-50 text-slate-300'
                    )}
                  >
                    <Check className="w-6 h-6" />
                  </button>
                </div>
              ))}
              {groups.map(group => (
                <div key={group.id} className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-sm text-emerald-900">{group.group_name}</h4>
                    <p className="text-[10px] text-emerald-600">Theo gói thuốc</p>
                  </div>
                  <button 
                    onClick={() => toggleAdherence(group.id, 'group', slot)}
                    className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                      adherence.find(a => a.item_id === group.id && a.type === 'group' && a.time_slot === slot && a.date === today)?.status === 1
                        ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100'
                        : 'bg-white text-emerald-300'
                    )}
                  >
                    <Check className="w-6 h-6" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden flex flex-col max-w-[480px] mx-auto shadow-2xl relative border-x border-slate-200">
      
      {/* Header */}
      <header className="bg-white px-6 py-4 flex items-center justify-between shadow-sm border-b border-slate-100 shrink-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-200">
            <HeartPulse className="w-5 h-5" />
          </div>
          <h1 className="text-lg font-bold tracking-tight">MedGuard AI</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowSOS(true)} className="w-9 h-9 bg-red-50 text-red-600 rounded-xl flex items-center justify-center active:scale-95 transition-transform"><PhoneCall className="w-4 h-4" /></button>
          <button onClick={() => setShowSettings(true)} className="w-9 h-9 bg-slate-50 text-slate-600 rounded-xl flex items-center justify-center active:scale-95 transition-transform"><Settings className="w-4 h-4" /></button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <AnimatePresence mode="wait">
          {activeTab === 'scan' ? (
            <motion.div key="scan" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full flex flex-col p-4 gap-4 overflow-y-auto custom-scrollbar">
              <div className="flex gap-2">
                {[
                  { id: 'medicine', icon: Pill, label: 'Quét thuốc' },
                  { id: 'symptom', icon: Stethoscope, label: 'Triệu chứng' },
                  { id: 'translate', icon: BookOpen, label: 'Dịch thuốc' }
                ].map(mode => (
                  <button 
                    key={mode.id}
                    onClick={() => setScanMode(mode.id as any)} 
                    className={cn(
                      "flex-1 py-3 rounded-2xl font-bold text-[10px] flex items-center justify-center gap-2 transition-all",
                      scanMode === mode.id ? 'bg-emerald-600 text-white shadow-lg' : 'bg-white text-slate-500 border border-slate-100'
                    )}
                  >
                    <mode.icon className="w-4 h-4" /> {mode.label}
                  </button>
                ))}
              </div>

              <div className="relative aspect-[3/4] bg-black rounded-[32px] overflow-hidden shadow-xl border-4 border-white shrink-0">
                {!capturedImage ? (
                  <>
                    <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                    <div className="absolute top-4 right-4 flex flex-col gap-2">
                      <button className="w-10 h-10 bg-black/30 text-white rounded-full flex items-center justify-center backdrop-blur-md"><Zap className="w-5 h-5" /></button>
                      <button className="w-10 h-10 bg-black/30 text-white rounded-full flex items-center justify-center backdrop-blur-md"><ZoomIn className="w-5 h-5" /></button>
                    </div>
                    <div className="absolute bottom-8 inset-x-0 flex items-center justify-center gap-8">
                      <button onClick={() => fileInputRef.current?.click()} className="w-12 h-12 bg-black/30 text-white rounded-full flex items-center justify-center backdrop-blur-md"><Upload className="w-5 h-5" /></button>
                      <button onClick={capturePhoto} className="w-20 h-20 bg-white rounded-full border-8 border-white/20 flex items-center justify-center active:scale-90 transition-transform"><div className="w-14 h-14 bg-emerald-600 rounded-full shadow-lg" /></button>
                      <div className="w-12 h-12" />
                    </div>
                    <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*" className="hidden" />
                  </>
                ) : (
                  <div className="relative h-full">
                    <img src={capturedImage} alt="Captured" className="w-full h-full object-cover" />
                    <button onClick={() => { setCapturedImage(null); setAnalysisResult(null); setTranslatedText(null); startCamera(); }} className="absolute top-6 right-6 w-10 h-10 bg-black/50 text-white rounded-full flex items-center justify-center backdrop-blur-md"><X className="w-5 h-5" /></button>
                  </div>
                )}
              </div>

              {capturedImage && !analysisResult && !translatedText && !isAnalyzing && (
                <button onClick={() => analyzeMedicine()} className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-transform"><Search className="w-5 h-5" /> Phân tích ngay</button>
              )}

              {isAnalyzing && (
                <div className="bg-white p-8 rounded-3xl text-center shadow-sm border border-slate-100"><Loader2 className="w-10 h-10 text-emerald-600 animate-spin mx-auto mb-3" /><p className="font-bold text-slate-700">Đang tra cứu AI...</p></div>
              )}

              {translatedText && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-6 rounded-[32px] shadow-xl border border-slate-100 space-y-4">
                  <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                    <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center"><BookOpen className="w-6 h-6" /></div>
                    <div>
                      <h3 className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">KẾT QUẢ AI</h3>
                      <h4 className="font-bold text-lg text-slate-900">Thông tin chi tiết</h4>
                    </div>
                  </div>
                  <div className="prose prose-sm max-w-none text-slate-700 leading-relaxed custom-scrollbar max-h-[300px] overflow-y-auto">
                    <Markdown>{translatedText}</Markdown>
                  </div>
                  <button onClick={() => { setTranslatedText(null); setCapturedImage(null); startCamera(); }} className="w-full bg-slate-100 text-slate-600 py-3 rounded-xl font-bold text-sm">Đóng</button>
                </motion.div>
              )}

              {analysisResult && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-6 rounded-[32px] shadow-xl border border-slate-100 space-y-5">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center"><CheckCircle2 className="w-6 h-6" /></div>
                      <div>
                        <h3 className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">KẾT QUẢ PHÂN TÍCH</h3>
                        <h4 className="font-bold text-lg text-slate-900">Xem & Chỉnh sửa</h4>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Tên thuốc</label>
                      <input value={analysisResult.name} onChange={(e) => setAnalysisResult({...analysisResult, name: e.target.value})} className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-emerald-500" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Hướng dẫn sử dụng</label>
                      <textarea value={analysisResult.usage} onChange={(e) => setAnalysisResult({...analysisResult, usage: e.target.value})} className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 min-h-[80px]" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Hạn dùng</label>
                        <input value={analysisResult.expiry_date} onChange={(e) => setAnalysisResult({...analysisResult, expiry_date: e.target.value})} className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Nhóm</label>
                        <input value={analysisResult.category} onChange={(e) => setAnalysisResult({...analysisResult, category: e.target.value})} className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500" />
                      </div>
                    </div>
                    <div className="bg-amber-50 p-3 rounded-2xl border border-amber-100">
                      <div className="flex items-center gap-2 mb-1"><AlertTriangle className="w-3 h-3 text-amber-600" /><p className="text-[10px] font-bold text-amber-600 uppercase">Cảnh báo</p></div>
                      <p className="text-xs text-amber-800 leading-relaxed">{analysisResult.interaction_warning}</p>
                    </div>
                  </div>

                  <button 
                    onClick={async () => { 
                      await supabase.from('inventory').insert([{ ...analysisResult, scanned_at: new Date().toISOString() }]);
                      setAnalysisResult(null); setCapturedImage(null); fetchData(); showToast("Đã lưu vào tủ thuốc!"); startCamera();
                    }} 
                    className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold shadow-xl shadow-emerald-100 flex items-center justify-center gap-2 active:scale-95 transition-transform"
                  >
                    <Save className="w-5 h-5" /> Lưu vào tủ thuốc
                  </button>
                </motion.div>
              )}
            </motion.div>
          ) : activeTab === 'inventory' ? (
            <motion.div key="inventory" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full flex flex-col p-4 gap-4">
              <div className="flex items-center justify-between gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input type="text" placeholder="Tìm thuốc..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-white border-none rounded-xl py-3 pl-10 pr-4 text-sm shadow-sm focus:ring-2 focus:ring-emerald-500" />
                </div>
                <button onClick={() => setSelectionMode(!selectionMode)} className={cn("p-3 rounded-xl shadow-md transition-colors", selectionMode ? 'bg-emerald-600 text-white' : 'bg-white text-slate-400 border border-slate-100')}><ListChecks className="w-5 h-5" /></button>
                <button onClick={() => setShowManualEntry(true)} className="bg-emerald-600 text-white p-3 rounded-xl shadow-lg"><Plus className="w-5 h-5" /></button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pb-20">
                {filteredInventory.map(item => (
                  <div key={item.id} className={cn("bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-4 transition-all", selectionMode && selectedIds.includes(item.id) && 'ring-2 ring-emerald-500 bg-emerald-50')} onClick={() => {
                    if (selectionMode) setSelectedIds(prev => prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id]);
                  }}>
                    <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-emerald-600 shrink-0"><Pill className="w-6 h-6" /></div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-slate-800 truncate">{item.name}</h4>
                      <p className="text-[10px] text-slate-400 truncate">{item.usage}</p>
                    </div>
                    {!selectionMode && (
                      <div className="flex items-center gap-1">
                        <button onClick={(e) => { e.stopPropagation(); setSelectedMedicineForChat(item); setActiveTab('chat'); }} className="p-2 text-slate-300 hover:text-emerald-600"><MessageSquare className="w-4 h-4" /></button>
                        <button onClick={async (e) => { e.stopPropagation(); await supabase.from('inventory').delete().eq('id', item.id); fetchData(); }} className="p-2 text-slate-300 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {selectionMode && selectedIds.length > 0 && (
                <motion.div initial={{ y: 50 }} animate={{ y: 0 }} className="absolute bottom-24 inset-x-4">
                  <button onClick={() => setIsCreatingGroup(true)} className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold shadow-2xl flex items-center justify-center gap-2"><Layers className="w-5 h-5" /> Tạo gói thuốc ({selectedIds.length})</button>
                </motion.div>
              )}
            </motion.div>
          ) : activeTab === 'groups' ? (
            <motion.div key="groups" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full flex flex-col p-4 gap-4 overflow-y-auto custom-scrollbar">
              <h2 className="text-2xl font-bold text-slate-800">Gói thuốc của bạn</h2>
              <div className="space-y-4 pb-20">
                {groups.map(group => (
                  <motion.div key={group.id} layout className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                    <div className="p-6 flex items-center gap-4 cursor-pointer" onClick={() => setExpandedGroupId(expandedGroupId === group.id ? null : group.id)}>
                      <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0"><Folder className="w-6 h-6" /></div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-slate-900 truncate">{group.group_name}</h3>
                        <p className="text-[11px] text-slate-500 truncate">{group.purpose}</p>
                      </div>
                      <ChevronDown className={cn("w-5 h-5 text-slate-400 transition-transform", expandedGroupId === group.id && 'rotate-180')} />
                    </div>
                    <AnimatePresence>
                      {expandedGroupId === group.id && (
                        <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden border-t border-slate-50 bg-slate-50/50 p-6 space-y-4">
                          <div className="prose prose-sm max-w-none text-slate-700"><Markdown>{group.ai_schedule}</Markdown></div>
                          <button onClick={async () => { await supabase.from('medicine_groups').delete().eq('id', group.id); fetchData(); }} className="text-red-600 text-[10px] font-bold uppercase flex items-center gap-1"><Trash2 className="w-3 h-3" /> Xóa gói này</button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          ) : activeTab === 'schedule' ? (
            <motion.div key="schedule" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full">
              {renderSchedule()}
            </motion.div>
          ) : (
            <motion.div key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full flex flex-col bg-white">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center"><User className="w-5 h-5" /></div>
                  <h3 className="font-bold text-sm">Bác sĩ MedGuard</h3>
                </div>
                <button onClick={async () => { await supabase.from('chat_history').delete().neq('id', 0); setChatHistory([]); }} className="text-slate-300 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                {chatHistory.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4">
                    <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center"><MessageSquare className="w-8 h-8" /></div>
                    <h4 className="font-bold text-slate-800">Chào bạn! Tôi là Bác sĩ AI.</h4>
                    <p className="text-xs text-slate-500 leading-relaxed">Tôi có thể giúp bạn hiểu rõ hơn về các loại thuốc trong kho hoặc tư vấn sức khỏe cơ bản.</p>
                  </div>
                )}
                {chatHistory.map((msg, idx) => (
                  <div key={idx} className={cn("flex", msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                    <div className={cn("max-w-[85%] p-3 rounded-2xl text-xs leading-relaxed shadow-sm", msg.role === 'user' ? 'bg-emerald-600 text-white rounded-tr-none' : 'bg-slate-100 text-slate-800 rounded-tl-none')}>
                      <div className="prose prose-sm max-w-none"><Markdown>{msg.content}</Markdown></div>
                    </div>
                  </div>
                ))}
                {isSendingChat && <div className="flex justify-start"><div className="bg-slate-100 p-3 rounded-2xl flex gap-1"><div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" /><div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0.2s]" /></div></div>}
                <div ref={chatEndRef} />
              </div>
              <div className="p-4 border-t border-slate-100 bg-white shrink-0 pb-24">
                {selectedMedicineForChat && <div className="mb-2 p-2 bg-emerald-50 rounded-xl flex items-center justify-between text-[10px] font-bold text-emerald-700 border border-emerald-100"><span>Hỏi về: {selectedMedicineForChat.name}</span><button onClick={() => setSelectedMedicineForChat(null)}><X className="w-3 h-3" /></button></div>}
                <form onSubmit={handleChat} className="flex gap-2">
                  <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Hỏi bác sĩ..." className="flex-1 bg-slate-100 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500" />
                  <button type="submit" disabled={isSendingChat || (!chatInput.trim() && !selectedMedicineForChat)} className="w-12 h-12 bg-emerald-600 text-white rounded-xl flex items-center justify-center shadow-md disabled:opacity-50 active:scale-95 transition-transform"><Send className="w-5 h-5" /></button>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-100 px-6 py-3 flex items-center justify-between shrink-0 z-50 pb-safe">
        {[
          { id: 'scan', icon: Camera, label: 'Quét' },
          { id: 'inventory', icon: Package, label: 'Tủ thuốc' },
          { id: 'groups', icon: Layers, label: 'Gói thuốc' },
          { id: 'schedule', icon: ListChecks, label: 'Lịch' },
          { id: 'chat', icon: MessageSquare, label: 'Chat' }
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={cn("flex flex-col items-center gap-1 transition-all", activeTab === tab.id ? 'text-emerald-600' : 'text-slate-400')}>
            <tab.icon className={cn("w-5 h-5", activeTab === tab.id && 'scale-110')} />
            <span className="text-[9px] font-bold uppercase tracking-tighter">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Modals */}
      <AnimatePresence>
        {showSOS && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white w-full max-w-[320px] rounded-[32px] p-8 text-center shadow-2xl">
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4"><PhoneCall className="w-8 h-8" /></div>
              <h2 className="text-xl font-bold mb-1">Khẩn cấp</h2>
              <p className="text-xs text-slate-500 mb-6">Liên hệ ngay nếu bạn cần giúp đỡ.</p>
              <div className="space-y-3">
                <a href="tel:115" className="flex items-center justify-center w-full bg-red-600 text-white py-4 rounded-2xl font-bold shadow-lg">Gọi Cấp cứu (115)</a>
                {settings.emergency_phone && <a href={`tel:${settings.emergency_phone}`} className="flex items-center justify-center w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold shadow-lg">Gọi {settings.emergency_name}</a>}
                <button onClick={() => setShowSOS(false)} className="w-full py-2 text-slate-400 text-sm font-bold">Đóng</button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showSettings && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white w-full max-w-[360px] rounded-[32px] p-8 shadow-2xl">
              <div className="flex justify-between items-center mb-6"><h2 className="text-xl font-bold">Cài đặt</h2><button onClick={() => setShowSettings(false)}><X className="w-5 h-5 text-slate-300" /></button></div>
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Tên người thân</label>
                  <input value={settings.emergency_name} onChange={(e) => setSettings({...settings, emergency_name: e.target.value})} className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Số điện thoại</label>
                  <input value={settings.emergency_phone} onChange={(e) => setSettings({...settings, emergency_phone: e.target.value})} className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500" />
                </div>
                <button onClick={async () => { await supabase.from('settings').upsert({ id: 1, ...settings }); setShowSettings(false); showToast("Đã lưu cài đặt"); }} className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold shadow-lg mt-2">Lưu cài đặt</button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showManualEntry && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white w-full max-w-[360px] rounded-[32px] p-8 shadow-2xl">
              <div className="flex justify-between items-center mb-6"><h2 className="text-xl font-bold">Thêm thuốc</h2><button onClick={() => setShowManualEntry(false)}><X className="w-5 h-5 text-slate-300" /></button></div>
              <form onSubmit={async (e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const data = {
                  name: formData.get('name') as string,
                  usage: formData.get('usage') as string,
                  expiry_date: formData.get('expiry_date') as string,
                  category: formData.get('category') as string,
                  simple_instructions: formData.get('usage') as string,
                  interaction_warning: 'N/A',
                  is_manual: true,
                  scanned_at: new Date().toISOString()
                };
                await supabase.from('inventory').insert([data]);
                setShowManualEntry(false); fetchData(); showToast("Đã thêm thuốc!");
              }} className="space-y-4">
                <input name="name" placeholder="Tên thuốc" required className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm" />
                <input name="usage" placeholder="Công dụng" required className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm" />
                <input name="expiry_date" placeholder="Hạn dùng" required className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm" />
                <input name="category" placeholder="Nhóm thuốc" required className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm" />
                <button type="submit" className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold shadow-lg">Lưu thuốc</button>
              </form>
            </motion.div>
          </motion.div>
        )}

        {isCreatingGroup && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white w-full max-w-[360px] rounded-[32px] p-8 shadow-2xl relative overflow-hidden">
              {isAnalyzingGroup && <div className="absolute inset-0 bg-white/90 backdrop-blur flex flex-col items-center justify-center z-10 p-8 text-center"><Loader2 className="w-10 h-10 text-emerald-600 animate-spin mb-3" /><p className="font-bold">Đang lập lịch trình...</p></div>}
              <div className="flex justify-between items-center mb-6"><h2 className="text-xl font-bold">Tạo gói thuốc</h2><button onClick={() => setIsCreatingGroup(false)}><X className="w-5 h-5 text-slate-300" /></button></div>
              <div className="space-y-4">
                <input value={groupForm.name} onChange={(e) => setGroupForm({...groupForm, name: e.target.value})} placeholder="Tên gói (Ví dụ: Đơn cảm cúm)" className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm" />
                <button onClick={createGroupFromSelection} disabled={!groupForm.name || selectedIds.length === 0} className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold shadow-lg disabled:opacity-50">Lưu & Lập lịch</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 50, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0, y: 20, x: '-50%' }} className={cn("fixed bottom-24 left-1/2 z-[110] px-5 py-3 rounded-xl shadow-2xl font-bold text-white text-xs flex items-center gap-2", toast.type === 'success' ? 'bg-emerald-600' : toast.type === 'warning' ? 'bg-amber-500' : 'bg-red-600')}>
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
